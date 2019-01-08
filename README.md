# BookBeat ePub Reader Web

A simple PoC for reading ePub (currently only v2) in a web browser.

To test this, clone the directory and run a web server with the project folder as the root.
Python 3 has a good built-in web server for this purpose.

```
$ python -m http.server
```

Currently supported:

- Loading books by URL (?book=book1 in the URL). This is required.
- Navigating pages with pan (scroll)

TBD:

- Navigating to location (chapter + progress in chapter)
- Navigating with click
- Offline support (Service Worker)
- Custom styling (fonts, sizes, margin etc.)
