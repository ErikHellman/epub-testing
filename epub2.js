'use strict';
const disableBodyScroll = bodyScrollLock.disableBodyScroll;
const PACKAGE_DOCUMENT_MIME = 'application/oebps-package+xml';

class Epub2Resource {
  static async create(href) {
    const resource = new Epub2Resource(href);
    await resource.init();
    return resource;
  }

  // Don't call directly
  constructor(href) {
    this.href = href;
    this.chapterTranslateX = 0;
  }

  async init() {
    const containerPath = `${this.href}/META-INF/container.xml`;
    this.container = await Epub2Resource.loadContainer(containerPath);
    const rootFiles = this.container.querySelectorAll('rootfile');
    const packageDocPath = Array.from(rootFiles).find(n => {
      return n.getAttribute('media-type') === PACKAGE_DOCUMENT_MIME;  // Can only be one in ePub2
    }).getAttribute('full-path');
    this.packageDocument = await Epub2Resource.loadPackageDocument(
        `${this.href}/${packageDocPath}`);
    const spine = this.packageDocument.querySelector('spine');
    const tocId = spine.getAttribute('toc');
    const ncxItem = this.packageDocument.querySelector(`#${tocId}`);
    const ncxFile = ncxItem.getAttribute('href');
    const contentPath = packageDocPath.substring(0,
        packageDocPath.lastIndexOf('/'));
    const basePath = `${this.href}/${contentPath}`;
    const ncxPath = `${basePath}/${ncxFile}`;
    const ncxDocument = await Epub2Resource.loadNavigationControl(ncxPath);
    this.navigationList = Epub2Resource.buildNavigationList(ncxDocument,
        basePath);
  }

  renderBook(rootElement) {
    this.navigationList.forEach(
        async navPoint => {
          await Epub2Resource.createIFrame(navPoint, rootElement);
        });
  }

  loadChapter(navPoint, rootElement) {
    const iframe = rootElement.querySelector(`#${navPoint.id}`);
    if (iframe.src === '') {
      console.log(`Load chapter ${navPoint.src}`);
      iframe.addEventListener('load', () => {
        const cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.href = '/resource.css';
        cssLink.type = 'text/css';
        iframe.contentDocument.head.appendChild(cssLink);
        disableBodyScroll(iframe.contentDocument);
        disableBodyScroll(iframe.contentDocument.body);
        const detector = new GestureDetector(iframe.contentDocument.body);
        detector.onPan = e => this.performPan(e, navPoint);
        console.log(`Rendered ${navPoint.id}`);
      });
      iframe.addEventListener('unload', e => console.log('unload', e));
      iframe.src = navPoint.src;
    } else {
      console.log(`Chapter ${iframe.src} already loaded!`);
    }
  }

  previousNavPoint(currentNavPoint) {
    let currentIndex = this.navigationList.indexOf(currentNavPoint);
    return this.navigationList[currentIndex - 1];
  }

  nextNavPoint(currentNavPoint) {
    let currentIndex = this.navigationList.indexOf(currentNavPoint);
    return this.navigationList[currentIndex + 1];
  }

  preloadFrames(navPoint) {
    const previousNavPoint = this.previousNavPoint(navPoint);
    const nextNavPoint = this.nextNavPoint(navPoint);

    if (previousNavPoint) {
      this.loadChapter(previousNavPoint, document.body);
    }

    if (nextNavPoint) {
      this.loadChapter(nextNavPoint, document.body);
    }
  }

  chapterPosition(element, navPoint) {
  }

  performPan(event, navPoint) {
    const columnGap = 40; // TODO This shouldn't be hard coded.
    const element = event.target;
    const pageScrollWidth = element.clientWidth - columnGap;
    const direction = event.deltaX > 0 ? -1 : 1;
    const maxScroll = element.scrollWidth - columnGap;
    const currentFrame = document.querySelector(`#${navPoint.id}`);
    console.log('Direction', direction);
    console.log('navPoint.translateX', navPoint.translateX);
    console.log('maxScroll', maxScroll);
    console.log('pageScrollWidth', pageScrollWidth);
    console.log('Final event:', event.isFinal);
    console.log('First event:', event.isFirst);

    if ((direction === 1 && navPoint.translateX === 0)
        || (direction === -1 && pageScrollWidth === maxScroll)
        || (direction === -1 && (Math.abs(navPoint.translateX) + pageScrollWidth) === element.scrollWidth)) {
      console.log('First or last page in chapter!');
      if (direction === 1 && document.body.children[0].id === currentFrame.id) { // TODO: Fetch the id from navigationList instead
        console.log('First page in first chapter - stop here!');
        return;
      } else if (direction === -1 &&
          document.body.children[document.body.childElementCount - 1].id ===
          currentFrame.id) { // TODO: Fetch the id from navigationList instead
        console.log('Last page in last chapter - stop here!');
        return;
      }

      const currentTranslateX = this.chapterTranslateX + -(event.deltaX);
      if (event.isFinal) {
        let pageWidth = document.body.clientWidth;
        const remainder = Math.abs(currentTranslateX % pageWidth);
        if (direction === -1 && remainder > pageWidth / 2) {
          this.chapterTranslateX -= pageWidth;
          this.preloadFrames(this.nextNavPoint(navPoint));
        } else if (direction === 1 && remainder < pageWidth / 2) {
          this.chapterTranslateX += pageWidth;
          this.preloadFrames(this.previousNavPoint(navPoint));
        }

        document.body.addEventListener('transitionend', e => {
          document.body.style.transition = 'unset';
        }, {once: true});
        document.body.style.transition = 'transform 200ms';
        document.body.style.transform = `translateX(${this.chapterTranslateX}px)`;
      } else {
        document.body.style.transform = `translateX(${currentTranslateX}px)`;
      }
    } else {
      // Inside chapter
      if (event.isFinal) {
        // Translation forward means negative translateX
        const currentTranslateX = navPoint.translateX + -(event.deltaX);
        console.log('Math.abs(currentTranslateX % pageScrollWidth)',
            currentTranslateX, pageScrollWidth,
            Math.abs(currentTranslateX % pageScrollWidth));
        const remainder = Math.abs(currentTranslateX % pageScrollWidth);
        // Should we scroll ahead or back one page?
        // This could be changed to be 1/3 or some other fraction of pageScrollWidth
        if (direction === -1 && remainder > pageScrollWidth / 2) {
          navPoint.translateX -= pageScrollWidth;
        } else if (direction === 1 && remainder < pageScrollWidth / 2) {
          navPoint.translateX += pageScrollWidth;
        }

        console.log('navPoint.translateX', navPoint.translateX);
        element.addEventListener('transitionend', e => {
          element.style.transition = 'unset';
        }, {once: true});
        element.style.transition = 'transform 200ms';
        element.style.transform = `translateX(${navPoint.translateX}px)`;
      } else {
        element.style.transform = `translateX(${navPoint.translateX +
        -(event.deltaX)}px)`;
        console.log('pan', navPoint.translateX + -(event.deltaX));
      }

    }
  }

  static async createIFrame(navPoint, parent) {
    const iframe = document.createElement('iframe');
    // iframe.src = navPoint.src;
    iframe.id = navPoint.id;
    parent.appendChild(iframe);
  }

  static async loadContainer(href) {
    const response = await fetch(href);
    const parser = new DOMParser();
    return parser.parseFromString(await response.text(), 'application/xml');
  }

  static async loadPackageDocument(href) {
    const response = await fetch(href);
    const parser = new DOMParser();
    return parser.parseFromString(await response.text(), 'application/xml');
  }

  static async loadNavigationControl(href) {
    const response = await fetch(href);
    const parser = new DOMParser();
    return parser.parseFromString(await response.text(), 'application/xml');
  }

  static buildNavigationList(doc, basePath) {
    const navPoints = doc.documentElement.querySelectorAll('navPoint');
    return Array.from(navPoints.values()).filter(p => {
      return p.hasAttribute('playOrder') && p.querySelector('content') !== null;
    }).map(p => {
      const contentSrc = Epub2Resource.findChildNode(p,
          n => n.tagName === 'content').getAttribute('src');
      const playOrder = parseInt(p.getAttribute('playOrder'));
      const id = p.getAttribute('id');
      const itemClass = p.getAttribute('class');
      const label = Epub2Resource.findChildNode(p,
          n => n.tagName === 'navLabel').querySelector('text').innerText;
      return {
        playOrder: playOrder,
        src: `${basePath}/${contentSrc}`,
        id: id,
        itemClass: itemClass,
        label: label,
        translateX: 0,
        maxScroll: 0,
      };
    }).sort((a, b) => {
      return a.playOrder - b.playOrder;
    });
  }

  static findChildNode(doc, predicate) {
    return Array.from(doc.childNodes.values()).find(predicate);
  }
}

class GestureDetector {

  constructor(element) {
    this._dragListener = null;
    this._clickListener = null;
    this.element = element;
    this.state = 'passive';
    this.startCoords = null;
    this.previousCoords = null;
    element.addEventListener('touchstart', this.onEvent.bind(this));
    element.addEventListener('touchmove', this.onEvent.bind(this));
    element.addEventListener('touchend', this.onEvent.bind(this));
    element.addEventListener('touchcancel', this.onEvent.bind(this));
    element.addEventListener('mousedown', this.onEvent.bind(this));
    element.addEventListener('mousemove', this.onEvent.bind(this));
    element.addEventListener('mouseup', this.onEvent.bind(this));
    element.addEventListener('mouseleave', this.onEvent.bind(this));
    // element.addEventListener('click', e => this.onEvent(e));
  }

  onEvent(event) {
    // console.log(event.type, event);
    switch (event.type) {
      case 'touchstart':
        this.state = 'dragging';
        this.startCoords = {
          screenX: event.touches[0].screenX,
          screenY: event.touches[0].screenY,
        };
        this.emitDragEvent(this.startCoords, false, true);
        break;
      case 'touchmove':
        const screenCoords = {
          screenX: event.touches[0].screenX,
          screenY: event.touches[0].screenY,
        };
        this.emitDragEvent(screenCoords, false, false);
        this.previousCoords = screenCoords;
        break;
      case 'touchend':
      case 'touchcancel':
        this.state = 'passive';
        if (this.previousCoords) {
          this.emitDragEvent(this.previousCoords, true, false);
        }
        this.previousCoords = null;
        this.startCoords = null;
        break;
      case 'mousedown':
        this.state = 'dragging';
        this.startCoords = {
          screenX: event.screenX,
          screenY: event.screenY,
        };
        break;
      case 'mousemove':
        if (this.state === 'dragging') {
          const screenCoords = {
            screenX: event.screenX,
            screenY: event.screenY,
          };
          this.emitDragEvent(screenCoords, false, false);
          this.previousCoords = screenCoords;
        }
        break;
      case 'mouseup':
      case 'mouseleave':
        if (this.state === 'dragging') {
          console.log(event.type, event);
          this.state = 'passive';
          if (this.previousCoords) {
            this.emitDragEvent(this.previousCoords, true, false);
          }
          this.previousCoords = null;
          this.startCoords = null;
        }
        break;
        /*
              case 'click':
                this.emitClickEvent(event);
                this.previousCoords = null;
                this.startCoords = null;
                break;
        */
    }
  }

  set onPan(listener) {
    this._dragListener = listener;
  }

  set onClick(listener) {
    this._clickListener = listener;
  }

  emitClickEvent(event) {
    console.log('click', event);
    const eventDetails = {
      screenX: event.screenX,
      screenY: event.screenY,
      target: this.element,
    };

    if (this._clickListener) {
      this._clickListener(eventDetails);
    }
  }

  emitDragEvent(coordinates, final = false, first = false) {
    if (this._dragListener) {
      const deltaX = this.startCoords.screenX - coordinates.screenX;
      const deltaY = this.startCoords.screenY - coordinates.screenY;
      const eventDetails = {
        isFinal: final,
        isFirst: first,
        deltaX: deltaX,
        deltaY: deltaY,
        target: this.element,
      };

      this._dragListener(eventDetails);
    }
  }
}

let epub = null;
(async () => {
  console.log('Start loading book!');
  const urlParams = new URLSearchParams(window.location.search);
  const book = urlParams.get('book');
  epub = await Epub2Resource.create(`books/${book}`);
  disableBodyScroll(document.querySelector(':root'));
  disableBodyScroll(document.querySelector('body'));
  epub.renderBook(document.body);
  epub.loadChapter(epub.navigationList[0], document.body);
  epub.loadChapter(epub.navigationList[1], document.body);
  console.log('Book loaded!');
})();
