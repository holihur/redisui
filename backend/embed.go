package main

import (
	"embed"
	"io/fs"
)

// embeddedWeb holds the built frontend. The release build copies
// frontend/dist into backend/web before compiling, so the resulting binary is
// fully self-contained. The placeholder .gitkeep is included (all:) so this
// directive always compiles even before a frontend build.
//
//go:embed all:web
var embeddedWeb embed.FS

// embeddedStatic returns the embedded frontend filesystem when it actually
// contains a built index.html.
func embeddedStatic() (fs.FS, bool) {
	sub, err := fs.Sub(embeddedWeb, "web")
	if err != nil {
		return nil, false
	}
	if _, err := fs.Stat(sub, "index.html"); err != nil {
		return nil, false
	}
	return sub, true
}
