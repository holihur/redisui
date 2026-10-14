package redisclient

import (
	"context"
	"strconv"
)

// Eval runs a Lua script with the given KEYS and ARGV (EVAL).
func (s *Session) Eval(ctx context.Context, db int, script string, keys, args []string) (any, error) {
	argv := make([]any, 0, 3+len(keys)+len(args))
	argv = append(argv, "EVAL", script, strconv.Itoa(len(keys)))
	for _, k := range keys {
		argv = append(argv, k)
	}
	for _, a := range args {
		argv = append(argv, a)
	}
	res, err := s.client(db).Do(ctx, argv...).Result()
	if err != nil {
		return nil, err
	}
	return normalizeValue(res), nil
}

// ScriptLoad caches a script server-side and returns its SHA1 (SCRIPT LOAD).
func (s *Session) ScriptLoad(ctx context.Context, db int, script string) (string, error) {
	return s.client(db).Do(ctx, "SCRIPT", "LOAD", script).Text()
}

// EvalSHA runs a previously loaded script by its SHA1 (EVALSHA).
func (s *Session) EvalSHA(ctx context.Context, db int, sha string, keys, args []string) (any, error) {
	argv := make([]any, 0, 3+len(keys)+len(args))
	argv = append(argv, "EVALSHA", sha, strconv.Itoa(len(keys)))
	for _, k := range keys {
		argv = append(argv, k)
	}
	for _, a := range args {
		argv = append(argv, a)
	}
	res, err := s.client(db).Do(ctx, argv...).Result()
	if err != nil {
		return nil, err
	}
	return normalizeValue(res), nil
}
