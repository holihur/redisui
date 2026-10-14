package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"redisui/internal/model"
	"redisui/internal/secret"
)

var ErrNotFound = errors.New("connection not found")

// Store persists connection profiles to a JSON file.
type Store struct {
	mu     sync.RWMutex
	path   string
	conns  map[string]model.Connection
	cipher *secret.Cipher
}

type fileFormat struct {
	Version     int                `json:"version"`
	Connections []model.Connection `json:"connections"`
}

// New loads (or creates) the store at path. Secrets are encrypted at rest
// with cipher; pass secret.Disabled() to store them in plaintext.
func New(path string, cipher *secret.Cipher) (*Store, error) {
	if cipher == nil {
		cipher = secret.Disabled()
	}
	s := &Store{path: path, conns: map[string]model.Connection{}, cipher: cipher}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return s, nil
		}
		return nil, err
	}
	if len(data) == 0 {
		return s, nil
	}
	var ff fileFormat
	if err := json.Unmarshal(data, &ff); err != nil {
		return nil, err
	}
	for _, c := range ff.Connections {
		if err := s.decryptConn(&c); err != nil {
			return nil, err
		}
		s.conns[c.ID] = c
	}
	return s, nil
}

func (s *Store) List() []model.Connection {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]model.Connection, 0, len(s.conns))
	for _, c := range s.conns {
		out = append(out, c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func (s *Store) Get(id string) (model.Connection, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	c, ok := s.conns[id]
	if !ok {
		return model.Connection{}, ErrNotFound
	}
	return c, nil
}

func (s *Store) Create(c model.Connection) (model.Connection, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC()
	c.CreatedAt = now
	c.UpdatedAt = now
	c.ApplyDefaults()
	s.conns[c.ID] = c
	return c, s.saveLocked()
}

func (s *Store) Update(id string, c model.Connection) (model.Connection, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	old, ok := s.conns[id]
	if !ok {
		return model.Connection{}, ErrNotFound
	}
	c.ID = id
	c.CreatedAt = old.CreatedAt
	c.UpdatedAt = time.Now().UTC()
	c.ApplyDefaults()
	s.conns[id] = c
	return c, s.saveLocked()
}

func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.conns[id]; !ok {
		return ErrNotFound
	}
	delete(s.conns, id)
	return s.saveLocked()
}

func (s *Store) saveLocked() error {
	ff := fileFormat{Version: 1, Connections: make([]model.Connection, 0, len(s.conns))}
	for _, c := range s.conns {
		enc, err := s.encryptConn(c)
		if err != nil {
			return err
		}
		ff.Connections = append(ff.Connections, enc)
	}
	sort.Slice(ff.Connections, func(i, j int) bool { return ff.Connections[i].Name < ff.Connections[j].Name })
	data, err := json.MarshalIndent(ff, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// encryptConn returns a copy of c with every secret field encrypted.
func (s *Store) encryptConn(c model.Connection) (model.Connection, error) {
	enc, err := s.cipher.Encrypt(c.Password)
	if err != nil {
		return c, err
	}
	c.Password = enc
	if c.SSH != nil {
		ssh := *c.SSH
		if ssh.Password, err = s.cipher.Encrypt(ssh.Password); err != nil {
			return c, err
		}
		if ssh.PrivateKey, err = s.cipher.Encrypt(ssh.PrivateKey); err != nil {
			return c, err
		}
		if ssh.Passphrase, err = s.cipher.Encrypt(ssh.Passphrase); err != nil {
			return c, err
		}
		c.SSH = &ssh
	}
	return c, nil
}

// decryptConn decrypts every secret field of c in place.
func (s *Store) decryptConn(c *model.Connection) error {
	var err error
	if c.Password, err = s.cipher.Decrypt(c.Password); err != nil {
		return err
	}
	if c.SSH != nil {
		if c.SSH.Password, err = s.cipher.Decrypt(c.SSH.Password); err != nil {
			return err
		}
		if c.SSH.PrivateKey, err = s.cipher.Decrypt(c.SSH.PrivateKey); err != nil {
			return err
		}
		if c.SSH.Passphrase, err = s.cipher.Decrypt(c.SSH.Passphrase); err != nil {
			return err
		}
	}
	return nil
}
