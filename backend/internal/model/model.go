package model

import "time"

// SSHAuthMethod describes how we authenticate against the SSH jump host.
type SSHAuthMethod string

const (
	SSHAuthPassword SSHAuthMethod = "password"
	SSHAuthKey      SSHAuthMethod = "key"
)

// SSHConfig holds the settings of an SSH tunnel (jump host).
type SSHConfig struct {
	Enabled    bool          `json:"enabled"`
	Host       string        `json:"host"`
	Port       int           `json:"port"`
	User       string        `json:"user"`
	AuthMethod SSHAuthMethod `json:"authMethod"`
	Password   string        `json:"password,omitempty"`
	PrivateKey string        `json:"privateKey,omitempty"`
	Passphrase string        `json:"passphrase,omitempty"`

	// HostKeyFingerprint, when set, pins the host key (SHA256:... or MD5:...).
	HostKeyFingerprint string `json:"hostKeyFingerprint,omitempty"`
}

// Connection is a persisted Redis connection profile.
type Connection struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username,omitempty"`
	Password string `json:"password,omitempty"`
	DB       int    `json:"db"`
	TLS      bool   `json:"tls"`
	// UseTLSVerify disables/enables certificate verification.
	TLSVerify bool       `json:"tlsVerify"`
	SSH       *SSHConfig `json:"ssh,omitempty"`

	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// Public returns a copy safe to send to the browser: secrets are replaced by
// a boolean flag telling the UI whether a secret is stored.
type PublicConnection struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	DB         int    `json:"db"`
	TLS        bool   `json:"tls"`
	TLSVerify  bool   `json:"tlsVerify"`
	HasAuth    bool   `json:"hasAuth"`
	SSH        *PublicSSH `json:"ssh,omitempty"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type PublicSSH struct {
	Enabled            bool          `json:"enabled"`
	Host               string        `json:"host"`
	Port               int           `json:"port"`
	User               string        `json:"user"`
	AuthMethod         SSHAuthMethod `json:"authMethod"`
	HasPassword        bool          `json:"hasPassword"`
	HasPrivateKey      bool          `json:"hasPrivateKey"`
	HasPassphrase      bool          `json:"hasPassphrase"`
	HostKeyFingerprint string        `json:"hostKeyFingerprint,omitempty"`
}

// Public builds the redacted representation of a connection.
func (c Connection) Public() PublicConnection {
	p := PublicConnection{
		ID:        c.ID,
		Name:      c.Name,
		Host:      c.Host,
		Port:      c.Port,
		Username:  c.Username,
		DB:        c.DB,
		TLS:       c.TLS,
		TLSVerify: c.TLSVerify,
		HasAuth:   c.Password != "",
		CreatedAt: c.CreatedAt,
		UpdatedAt: c.UpdatedAt,
	}
	if c.SSH != nil {
		p.SSH = &PublicSSH{
			Enabled:            c.SSH.Enabled,
			Host:               c.SSH.Host,
			Port:               c.SSH.Port,
			User:               c.SSH.User,
			AuthMethod:         c.SSH.AuthMethod,
			HasPassword:        c.SSH.Password != "",
			HasPrivateKey:      c.SSH.PrivateKey != "",
			HasPassphrase:      c.SSH.Passphrase != "",
			HostKeyFingerprint: c.SSH.HostKeyFingerprint,
		}
	}
	return p
}

// DefaultPorts fills in sensible defaults.
func (c *Connection) ApplyDefaults() {
	if c.Port == 0 {
		c.Port = 6379
	}
	if c.SSH != nil && c.SSH.Enabled {
		if c.SSH.Port == 0 {
			c.SSH.Port = 22
		}
		if c.SSH.AuthMethod == "" {
			c.SSH.AuthMethod = SSHAuthPassword
		}
	}
}

// MergeSecrets keeps stored secrets when the client sends an empty value.
// A value of nil-ish (empty string) means "keep existing".
func (c *Connection) MergeSecrets(old Connection) {
	if c.Password == "" {
		c.Password = old.Password
	}
	if c.SSH != nil && old.SSH != nil {
		c.SSH.MergeSecrets(*old.SSH)
	}
}

// MergeSecrets fills empty SSH secrets from a previously stored config.
func (c *SSHConfig) MergeSecrets(old SSHConfig) {
	if c.Password == "" {
		c.Password = old.Password
	}
	if c.PrivateKey == "" {
		c.PrivateKey = old.PrivateKey
	}
	if c.Passphrase == "" {
		c.Passphrase = old.Passphrase
	}
}
