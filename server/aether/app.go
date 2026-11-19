package aether

import (
	"net/http"
	"strings"
)

type Middleware func(http.Handler) http.Handler

type App struct {
	mux        *http.ServeMux
	middleware []Middleware
}

type Group struct {
	app        *App
	prefix     string
	middleware []Middleware
}

func New() *App {
	return &App{
		mux: http.NewServeMux(),
	}
}

func (a *App) Use(middleware ...Middleware) {
	a.middleware = append(a.middleware, middleware...)
}

func (a *App) Handle(method string, pattern string, handler http.HandlerFunc, middleware ...Middleware) {
	a.mux.Handle(method+" "+pattern, chain(handler, middleware))
}

func (a *App) Get(pattern string, handler http.HandlerFunc, middleware ...Middleware) {
	a.Handle(http.MethodGet, pattern, handler, middleware...)
}

func (a *App) Post(pattern string, handler http.HandlerFunc, middleware ...Middleware) {
	a.Handle(http.MethodPost, pattern, handler, middleware...)
}

func (a *App) Put(pattern string, handler http.HandlerFunc, middleware ...Middleware) {
	a.Handle(http.MethodPut, pattern, handler, middleware...)
}

func (a *App) Patch(pattern string, handler http.HandlerFunc, middleware ...Middleware) {
	a.Handle(http.MethodPatch, pattern, handler, middleware...)
}

func (a *App) Delete(pattern string, handler http.HandlerFunc, middleware ...Middleware) {
	a.Handle(http.MethodDelete, pattern, handler, middleware...)
}

func (a *App) Group(prefix string, middleware ...Middleware) *Group {
	return &Group{
		app:        a,
		prefix:     normalizePrefix(prefix),
		middleware: middleware,
	}
}

func (a *App) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	a.Handler().ServeHTTP(w, r)
}

func (a *App) Handler() http.Handler {
	return chain(a.mux, a.middleware)
}

func (g *Group) Use(middleware ...Middleware) {
	g.middleware = append(g.middleware, middleware...)
}

func (g *Group) Handle(method string, pattern string, handler http.HandlerFunc, middleware ...Middleware) {
	combined := make([]Middleware, 0, len(g.middleware)+len(middleware))
	combined = append(combined, g.middleware...)
	combined = append(combined, middleware...)
	g.app.Handle(method, joinPattern(g.prefix, pattern), handler, combined...)
}

func (g *Group) Get(pattern string, handler http.HandlerFunc, middleware ...Middleware) {
	g.Handle(http.MethodGet, pattern, handler, middleware...)
}

func (g *Group) Post(pattern string, handler http.HandlerFunc, middleware ...Middleware) {
	g.Handle(http.MethodPost, pattern, handler, middleware...)
}

func (g *Group) Put(pattern string, handler http.HandlerFunc, middleware ...Middleware) {
	g.Handle(http.MethodPut, pattern, handler, middleware...)
}

func (g *Group) Patch(pattern string, handler http.HandlerFunc, middleware ...Middleware) {
	g.Handle(http.MethodPatch, pattern, handler, middleware...)
}

func (g *Group) Delete(pattern string, handler http.HandlerFunc, middleware ...Middleware) {
	g.Handle(http.MethodDelete, pattern, handler, middleware...)
}

func (g *Group) Group(prefix string, middleware ...Middleware) *Group {
	combined := make([]Middleware, 0, len(g.middleware)+len(middleware))
	combined = append(combined, g.middleware...)
	combined = append(combined, middleware...)
	return &Group{
		app:        g.app,
		prefix:     joinPattern(g.prefix, prefix),
		middleware: combined,
	}
}

func Param(r *http.Request, name string) string {
	return r.PathValue(name)
}

func chain(handler http.Handler, middleware []Middleware) http.Handler {
	for index := len(middleware) - 1; index >= 0; index-- {
		handler = middleware[index](handler)
	}

	return handler
}

func joinPattern(prefix string, pattern string) string {
	prefix = normalizePrefix(prefix)

	if prefix == "" {
		if pattern == "" {
			return "/"
		}

		return pattern
	}

	if pattern == "" || pattern == "/" {
		return prefix
	}

	return strings.TrimRight(prefix, "/") + "/" + strings.TrimLeft(pattern, "/")
}

func normalizePrefix(prefix string) string {
	if prefix == "" || prefix == "/" {
		return ""
	}

	return "/" + strings.Trim(prefix, "/")
}
