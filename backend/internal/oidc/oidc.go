// Package oidc implements a minimal OpenID Connect relying party: discovery,
// authorization-code exchange and ID-token verification against the provider's
// JWKS.
package oidc

import (
	"context"
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type Config struct {
	Issuer       string
	ClientID     string
	ClientSecret string
	RedirectURL  string
	Scopes       []string
	// Name is shown on the login button (defaults to "SSO").
	Name string
}

type Provider struct {
	cfg    Config
	client *http.Client

	mu     sync.Mutex
	disco  *discovery
	jwks   map[string]crypto.PublicKey
	jwksAt time.Time
}

type discovery struct {
	Issuer                string `json:"issuer"`
	AuthorizationEndpoint string `json:"authorization_endpoint"`
	TokenEndpoint         string `json:"token_endpoint"`
	UserinfoEndpoint      string `json:"userinfo_endpoint"`
	JWKSURI               string `json:"jwks_uri"`
}

func New(cfg Config) *Provider {
	if len(cfg.Scopes) == 0 {
		cfg.Scopes = []string{"openid", "email", "profile"}
	}
	return &Provider{cfg: cfg, client: &http.Client{Timeout: 15 * time.Second}}
}

func (p *Provider) Name() string {
	if p.cfg.Name != "" {
		return p.cfg.Name
	}
	return "SSO"
}

func (p *Provider) discover(ctx context.Context) (*discovery, error) {
	p.mu.Lock()
	if p.disco != nil {
		d := p.disco
		p.mu.Unlock()
		return d, nil
	}
	p.mu.Unlock()

	u := strings.TrimRight(p.cfg.Issuer, "/") + "/.well-known/openid-configuration"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("oidc discovery: %s", resp.Status)
	}
	var d discovery
	if err := json.NewDecoder(resp.Body).Decode(&d); err != nil {
		return nil, err
	}
	if d.AuthorizationEndpoint == "" || d.TokenEndpoint == "" || d.JWKSURI == "" {
		return nil, errors.New("oidc discovery: incomplete metadata")
	}
	if d.Issuer != "" && d.Issuer != p.cfg.Issuer && strings.TrimRight(d.Issuer, "/") != strings.TrimRight(p.cfg.Issuer, "/") {
		return nil, fmt.Errorf("oidc issuer mismatch: %s", d.Issuer)
	}
	p.mu.Lock()
	p.disco = &d
	p.mu.Unlock()
	return &d, nil
}

// AuthURL builds the authorization redirect URL. When codeChallenge is set,
// PKCE (S256) is used.
func (p *Provider) AuthURL(ctx context.Context, state, nonce, codeChallenge string) (string, error) {
	d, err := p.discover(ctx)
	if err != nil {
		return "", err
	}
	u, err := url.Parse(d.AuthorizationEndpoint)
	if err != nil {
		return "", err
	}
	q := u.Query()
	q.Set("response_type", "code")
	q.Set("client_id", p.cfg.ClientID)
	q.Set("redirect_uri", p.cfg.RedirectURL)
	q.Set("scope", strings.Join(p.cfg.Scopes, " "))
	q.Set("state", state)
	q.Set("nonce", nonce)
	if codeChallenge != "" {
		q.Set("code_challenge", codeChallenge)
		q.Set("code_challenge_method", "S256")
	}
	u.RawQuery = q.Encode()
	return u.String(), nil
}

type Tokens struct {
	AccessToken string
	IDToken     string
	TokenType   string
	ExpiresIn   int
}

// Exchange swaps an authorization code for tokens (with optional PKCE verifier).
func (p *Provider) Exchange(ctx context.Context, code, codeVerifier string) (*Tokens, error) {
	d, err := p.discover(ctx)
	if err != nil {
		return nil, err
	}
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("redirect_uri", p.cfg.RedirectURL)
	form.Set("client_id", p.cfg.ClientID)
	if codeVerifier != "" {
		form.Set("code_verifier", codeVerifier)
	}
	if p.cfg.ClientSecret != "" {
		form.Set("client_secret", p.cfg.ClientSecret)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, d.TokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	if p.cfg.ClientSecret != "" {
		req.SetBasicAuth(url.QueryEscape(p.cfg.ClientID), url.QueryEscape(p.cfg.ClientSecret))
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("oidc token endpoint: %s", resp.Status)
	}
	var tr struct {
		AccessToken string `json:"access_token"`
		IDToken     string `json:"id_token"`
		TokenType   string `json:"token_type"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		return nil, err
	}
	if tr.IDToken == "" {
		return nil, errors.New("oidc: no id_token returned")
	}
	return &Tokens{AccessToken: tr.AccessToken, IDToken: tr.IDToken, TokenType: tr.TokenType, ExpiresIn: tr.ExpiresIn}, nil
}

type Claims struct {
	Subject string
	Email   string
	Name    string
	Nonce   string
	Raw     map[string]any
}

// VerifyIDToken validates the ID token signature and standard claims.
func (p *Provider) VerifyIDToken(ctx context.Context, idToken, nonce string) (*Claims, error) {
	parts := strings.Split(idToken, ".")
	if len(parts) != 3 {
		return nil, errors.New("oidc: malformed id_token")
	}
	headerRaw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, err
	}
	var header struct {
		Alg string `json:"alg"`
		Kid string `json:"kid"`
	}
	if err := json.Unmarshal(headerRaw, &header); err != nil {
		return nil, err
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, err
	}
	key, err := p.keyFor(ctx, header.Kid)
	if err != nil {
		return nil, err
	}
	if err := verifySignature(header.Alg, key, parts[0]+"."+parts[1], sig); err != nil {
		return nil, err
	}

	payloadRaw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, err
	}
	var raw map[string]any
	if err := json.Unmarshal(payloadRaw, &raw); err != nil {
		return nil, err
	}
	if iss, _ := raw["iss"].(string); iss != "" {
		if strings.TrimRight(iss, "/") != strings.TrimRight(p.cfg.Issuer, "/") {
			return nil, fmt.Errorf("oidc: issuer mismatch %q", iss)
		}
	}
	if exp, ok := numClaim(raw["exp"]); ok && time.Now().Unix() > int64(exp) {
		return nil, errors.New("oidc: id_token expired")
	}
	if !audienceContains(raw["aud"], p.cfg.ClientID) {
		return nil, errors.New("oidc: audience mismatch")
	}
	if nonce != "" {
		if n, _ := raw["nonce"].(string); n != nonce {
			return nil, errors.New("oidc: nonce mismatch")
		}
	}

	c := &Claims{Raw: raw}
	c.Subject, _ = raw["sub"].(string)
	c.Email, _ = raw["email"].(string)
	c.Name, _ = raw["name"].(string)
	c.Nonce, _ = raw["nonce"].(string)
	if c.Name == "" {
		if pn, ok := raw["preferred_username"].(string); ok {
			c.Name = pn
		}
	}
	return c, nil
}

func (p *Provider) keyFor(ctx context.Context, kid string) (crypto.PublicKey, error) {
	p.mu.Lock()
	keys, at := p.jwks, p.jwksAt
	p.mu.Unlock()
	if keys == nil || time.Since(at) > time.Hour {
		if err := p.refreshJWKS(ctx); err != nil {
			return nil, err
		}
		p.mu.Lock()
		keys = p.jwks
		p.mu.Unlock()
	}
	if k, ok := keys[kid]; ok {
		return k, nil
	}
	// Unknown kid: refresh once.
	if err := p.refreshJWKS(ctx); err != nil {
		return nil, err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if k, ok := p.jwks[kid]; ok {
		return k, nil
	}
	return nil, fmt.Errorf("oidc: signing key %q not found", kid)
}

func (p *Provider) refreshJWKS(ctx context.Context) error {
	d, err := p.discover(ctx)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, d.JWKSURI, nil)
	if err != nil {
		return err
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("oidc jwks: %s", resp.Status)
	}
	keys, err := parseJWKS(resp.Body)
	if err != nil {
		return err
	}
	p.mu.Lock()
	p.jwks = keys
	p.jwksAt = time.Now()
	p.mu.Unlock()
	return nil
}

type jwk struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Use string `json:"use"`
	N   string `json:"n"`
	E   string `json:"e"`
	Crv string `json:"crv"`
	X   string `json:"x"`
	Y   string `json:"y"`
}

func parseJWKS(r io.Reader) (map[string]crypto.PublicKey, error) {
	var set struct {
		Keys []jwk `json:"keys"`
	}
	if err := json.NewDecoder(r).Decode(&set); err != nil {
		return nil, err
	}
	out := map[string]crypto.PublicKey{}
	for _, k := range set.Keys {
		switch k.Kty {
		case "RSA":
			nBytes, err := base64.RawURLEncoding.DecodeString(k.N)
			if err != nil {
				continue
			}
			eBytes, err := base64.RawURLEncoding.DecodeString(k.E)
			if err != nil {
				continue
			}
			e := 0
			for _, b := range eBytes {
				e = e<<8 | int(b)
			}
			out[k.Kid] = &rsa.PublicKey{N: new(big.Int).SetBytes(nBytes), E: e}
		case "EC":
			var curve elliptic.Curve
			switch k.Crv {
			case "P-256":
				curve = elliptic.P256()
			case "P-384":
				curve = elliptic.P384()
			case "P-521":
				curve = elliptic.P521()
			default:
				continue
			}
			xb, err1 := base64.RawURLEncoding.DecodeString(k.X)
			yb, err2 := base64.RawURLEncoding.DecodeString(k.Y)
			if err1 != nil || err2 != nil {
				continue
			}
			out[k.Kid] = &ecdsa.PublicKey{Curve: curve, X: new(big.Int).SetBytes(xb), Y: new(big.Int).SetBytes(yb)}
		}
	}
	if len(out) == 0 {
		return nil, errors.New("oidc: no usable keys in JWKS")
	}
	return out, nil
}

func verifySignature(alg string, key crypto.PublicKey, signingInput string, sig []byte) error {
	switch alg {
	case "RS256", "RS384", "RS512":
		pub, ok := key.(*rsa.PublicKey)
		if !ok {
			return errors.New("oidc: key is not RSA")
		}
		h, hash := hashFor(alg, signingInput)
		return rsa.VerifyPKCS1v15(pub, hash, h, sig)
	case "ES256", "ES384", "ES512":
		pub, ok := key.(*ecdsa.PublicKey)
		if !ok {
			return errors.New("oidc: key is not EC")
		}
		h, _ := hashFor(alg, signingInput)
		n := len(sig) / 2
		if n == 0 {
			return errors.New("oidc: bad signature")
		}
		r := new(big.Int).SetBytes(sig[:n])
		s := new(big.Int).SetBytes(sig[n:])
		if !ecdsa.Verify(pub, h, r, s) {
			return errors.New("oidc: signature verification failed")
		}
		return nil
	case "none":
		return errors.New("oidc: unsigned tokens are not accepted")
	default:
		return fmt.Errorf("oidc: unsupported alg %q", alg)
	}
}

func hashFor(alg, input string) ([]byte, crypto.Hash) {
	switch alg {
	case "RS384", "ES384":
		sum := sha512.Sum384([]byte(input))
		return sum[:], crypto.SHA384
	case "RS512", "ES512":
		sum := sha512.Sum512([]byte(input))
		return sum[:], crypto.SHA512
	default:
		sum := sha256.Sum256([]byte(input))
		return sum[:], crypto.SHA256
	}
}

func numClaim(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case json.Number:
		f, err := n.Float64()
		return f, err == nil
	}
	return 0, false
}

func audienceContains(aud any, clientID string) bool {
	switch a := aud.(type) {
	case string:
		return a == clientID
	case []any:
		for _, v := range a {
			if s, ok := v.(string); ok && s == clientID {
				return true
			}
		}
	}
	return false
}
