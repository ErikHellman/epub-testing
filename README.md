# ePub Reader Web

A simple PoC for reading ePub (currently only v2) in a web browser.

To test this, clone the directory and run a web server with the project folder as the root.
Python 3 has a good built-in web server for this purpose.

```
$ python -m http.server
```

Next, open http://localhost:8000/allbooks.html and select the book you want to read. Progress is stored in localStorage.

Currently supported:

- Loading books by URL (?book=book1 in the URL). This is required.
- Navigating pages with pan (scroll)
- Navigating with click
- Navigating to location (chapter + progress in chapter)

TBD:

- Offline support (Service Worker)
- Custom styling (fonts, sizes, margin etc.)
