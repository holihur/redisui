package proxy

import (
	"bytes"
	"strconv"
	"strings"
)

// respParser incrementally extracts command names from a RESP request stream.
type respParser struct {
	buf []byte
}

// Feed adds bytes and returns the command names of any complete requests.
func (p *respParser) Feed(data []byte) []string {
	p.buf = append(p.buf, data...)
	var cmds []string
	for len(p.buf) > 0 {
		name, consumed, ok := parseRESP(p.buf)
		if !ok {
			break
		}
		if consumed <= 0 {
			p.buf = p.buf[1:]
			continue
		}
		p.buf = p.buf[consumed:]
		if name != "" {
			cmds = append(cmds, name)
		}
	}
	if len(p.buf) > 1<<20 {
		p.buf = nil // guard against unbounded growth on garbage input
	}
	return cmds
}

// parseRESP parses one request. It returns the command name, the number of
// bytes consumed, and whether a full request is available. On malformed input
// it consumes the buffer to resynchronize.
func parseRESP(b []byte) (string, int, bool) {
	if len(b) == 0 {
		return "", 0, false
	}
	if b[0] != '*' {
		// Inline command (e.g. via telnet): read to end of line.
		idx := bytes.IndexByte(b, '\n')
		if idx < 0 {
			return "", 0, false
		}
		fields := bytes.Fields(bytes.TrimRight(b[:idx], "\r"))
		name := ""
		if len(fields) > 0 {
			name = strings.ToUpper(string(fields[0]))
		}
		return name, idx + 1, true
	}

	lineEnd := bytes.IndexByte(b, '\n')
	if lineEnd < 0 {
		return "", 0, false
	}
	count, err := strconv.Atoi(string(bytes.TrimRight(b[1:lineEnd], "\r")))
	if err != nil || count < 0 {
		return "", lineEnd + 1, true // drop the bad header line and resync
	}
	pos := lineEnd + 1
	name := ""
	for i := 0; i < count; i++ {
		if pos >= len(b) {
			return "", 0, false
		}
		if b[pos] != '$' {
			return "", pos + 1, true // drop the offending byte
		}
		nl := bytes.IndexByte(b[pos:], '\n')
		if nl < 0 {
			return "", 0, false
		}
		length, err := strconv.Atoi(string(bytes.TrimRight(b[pos+1:pos+nl], "\r")))
		if err != nil || length < 0 {
			return "", pos + nl + 1, true
		}
		start := pos + nl + 1
		end := start + length
		if end+2 > len(b) {
			return "", 0, false
		}
		if i == 0 {
			name = strings.ToUpper(string(b[start:end]))
		}
		pos = end + 2
	}
	return name, pos, true
}
