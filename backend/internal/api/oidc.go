package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"redisui/internal/account"
	"redisui/internal/oidc"
)

// OIDCConfig configures the OpenID Connect login flow.
type OIDCConfig struct {
	Provider       *oidc.Provider
	DefaultRole    account.Role
	AllowedEmails  []string
	AllowedDomains []string
	AdminEmails    []string
	// PostLoginPath is where the browser is redirected after login (default "/").
	PostLoginPath string
}

type oidcState struct {
	nonce   string
	created time.Time
}

func (s *Server) oidcEnabled() bool { return s.oidc != nil && s.oidc.Provider != nil }

func (s *Server) oidcLogin(w http.ResponseWriter, r *http.Request) {
	if !s.oidcEnabled() {
		writeErr(w, http.StatusNotFound, errString("OIDC is not configured"))
		return
	}
	state := randomHex(16)
	nonce := randomHex(16)
	s.oidcMu.Lock()
	// prune expired states
	for k, v := range s.oidcStates {
		if time.Since(v.created) > 10*time.Minute {
			delete(s.oidcStates, k)
		}
	}
	s.oidcStates[state] = oidcState{nonce: nonce, created: time.Now()}
	s.oidcMu.Unlock()

	authURL, err := s.oidc.Provider.AuthURL(r.Context(), state, nonce)
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	http.Redirect(w, r, authURL, http.StatusFound)
}

func (s *Server) oidcCallback(w http.ResponseWriter, r *http.Request) {
	if !s.oidcEnabled() {
		writeErr(w, http.StatusNotFound, errString("OIDC is not configured"))
		return
	}
	q := r.URL.Query()
	if e := q.Get("error"); e != "" {
		writeErr(w, http.StatusUnauthorized, errString("oidc error: "+e+" "+q.Get("error_description")))
		return
	}
	state := q.Get("state")
	code := q.Get("code")
	if state == "" || code == "" {
		writeErr(w, http.StatusBadRequest, errString("missing state or code"))
		return
	}
	s.oidcMu.Lock()
	st, ok := s.oidcStates[state]
	delete(s.oidcStates, state)
	s.oidcMu.Unlock()
	if !ok || time.Since(st.created) > 10*time.Minute {
		writeErr(w, http.StatusBadRequest, errString("invalid or expired state"))
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()

	tokens, err := s.oidc.Provider.Exchange(ctx, code)
	if err != nil {
		writeErr(w, http.StatusBadGateway, err)
		return
	}
	claims, err := s.oidc.Provider.VerifyIDToken(ctx, tokens.IDToken, st.nonce)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err)
		return
	}

	role, err := s.oidc.authorize(claims)
	if err != nil {
		writeErr(w, http.StatusForbidden, err)
		return
	}

	username := claims.Email
	if username == "" {
		username = claims.Subject
	}
	token, _ := s.logins.Create(account.User{Username: username, Role: role})

	dest := s.oidc.PostLoginPath
	if dest == "" {
		dest = "/"
	}
	http.Redirect(w, r, dest+"#oidc_token="+url.QueryEscape(token), http.StatusFound)
}

func (s *Server) oidcAuthorize(c *oidc.Claims) (account.Role, error) { return s.oidc.authorize(c) }

func (c *OIDCConfig) authorize(claims *oidc.Claims) (account.Role, error) {
	email := strings.ToLower(strings.TrimSpace(claims.Email))
	if len(c.AllowedEmails) > 0 {
		found := false
		for _, e := range c.AllowedEmails {
			if strings.EqualFold(strings.TrimSpace(e), email) {
				found = true
				break
			}
		}
		if !found {
			return "", errString("email is not allowed")
		}
	}
	if len(c.AllowedDomains) > 0 {
		_, domain, ok := strings.Cut(email, "@")
		allowed := false
		if ok {
			for _, d := range c.AllowedDomains {
				if strings.EqualFold(strings.TrimSpace(d), domain) {
					allowed = true
					break
				}
			}
		}
		if !allowed {
			return "", errString("email domain is not allowed")
		}
	}
	role := c.DefaultRole
	if role == "" {
		role = account.RoleViewer
	}
	for _, e := range c.AdminEmails {
		if strings.EqualFold(strings.TrimSpace(e), email) && email != "" {
			role = account.RoleAdmin
		}
	}
	return role, nil
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

var _ = sync.Mutex{}
