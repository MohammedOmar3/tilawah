package main

import (
	"log"
	"net/http"
	"os"

	"github.com/MohammedOmar3/tilawah/apps/api/internal/httpapi"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", httpapi.Healthz)
	log.Printf("listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
