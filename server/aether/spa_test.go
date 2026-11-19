package aether

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

func TestSPA(t *testing.T) {
	files := fstest.MapFS{
		"index.html": {Data: []byte("<html>app</html>")},
		"app.js":     {Data: []byte("console.log('app')")},
	}
	api := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("api:" + r.URL.Path))
	})
	handler := SPA(api, fs.FS(files))

	apiResponse := httptest.NewRecorder()
	handler.ServeHTTP(apiResponse, httptest.NewRequest(http.MethodGet, "/api/health", nil))

	if apiResponse.Body.String() != "api:/api/health" {
		t.Fatalf("unexpected api response: %s", apiResponse.Body.String())
	}

	fileResponse := httptest.NewRecorder()
	handler.ServeHTTP(fileResponse, httptest.NewRequest(http.MethodGet, "/app.js", nil))

	if fileResponse.Body.String() != "console.log('app')" {
		t.Fatalf("unexpected file response: %s", fileResponse.Body.String())
	}

	fallbackResponse := httptest.NewRecorder()
	handler.ServeHTTP(fallbackResponse, httptest.NewRequest(http.MethodGet, "/users/42", nil))

	if fallbackResponse.Body.String() != "<html>app</html>" {
		t.Fatalf("unexpected fallback response: %s", fallbackResponse.Body.String())
	}

	postResponse := httptest.NewRecorder()
	handler.ServeHTTP(postResponse, httptest.NewRequest(http.MethodPost, "/users/42", nil))

	if postResponse.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", postResponse.Code)
	}
}
