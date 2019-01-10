'use strict';
const disableBodyScroll = bodyScrollLock.disableBodyScroll;
const PACKAGE_DOCUMENT_MIME = 'application/oebps-package+xml';

class Epub {
    static async create(href) {
        const resource = new Epub(href);
        await resource.init();
        return resource;
    }

    // Don't call directly
    constructor(href) {
        this.href = href;
        this.chapterTranslateX = 0;
        this.currentNavPoint = null;
    }

    async init() {
        const containerPath = `${this.href}/META-INF/container.xml`;
        this.container = await Epub.loadContainer(containerPath);
        const rootFiles = this.container.querySelectorAll('rootfile');
        const packageDocPath = Array.from(rootFiles).find(n => {
            return n.getAttribute('media-type') === PACKAGE_DOCUMENT_MIME;  // Can only be one in ePub2
        }).getAttribute('full-path');
        this.packageDocument = await Epub.loadPackageDocument(
            `${this.href}/${packageDocPath}`);
        const basePath = `${this.href}/${packageDocPath.substring(0, packageDocPath.lastIndexOf('/'))}/`;
        this.navigationList = Epub.buildNavigationFromSpine(this.packageDocument, basePath);
        /*
                const spine = this.packageDocument.querySelector('spine');
                const tocId = spine.getAttribute('toc');
                const ncxItem = this.packageDocument.querySelector(`#${tocId}`);
                const ncxFile = ncxItem.getAttribute('href');
                const contentPath = packageDocPath.substring(0,
                    packageDocPath.lastIndexOf('/'));
                const basePath = `${this.href}/${contentPath}`;
                const ncxPath = `${basePath}/${ncxFile}`;
                const ncxDocument = await Epub.loadNavigationControl(ncxPath);
                this.navigationList = Epub.buildNavigationList(ncxDocument,
                    basePath);
        */
    }

    renderBook(rootElement) {
        this.navigationList.forEach(
            async navPoint => {
                await Epub.createIFrame(navPoint, rootElement);
            });
    }

    get currentFrame() {
        return document.querySelector(`#${this.currentNavPoint.id}`);
    }

    hijackLinks(rootElement) {
        const links = Array.from(rootElement.querySelectorAll('a'));
        links.forEach(link => {
            const href = link.getAttribute('href');
            console.log(`Hijack link to ${href}`);
            link.removeAttribute('href');
            link.addEventListener('click', () => {
                console.log(`Go to ${href}`);
                const navPoint = this.navigationList.find(np => {
                    return np.src.endsWith(href);
                });
                this.goToChapter(navPoint);
            })
        });
    }

    loadChapter(navPoint, rootElement) {
        const iframe = rootElement.querySelector(`#${navPoint.id}`);
        if (iframe.src === '') {
            console.log(`Load chapter ${navPoint.src}`);
            iframe.addEventListener('load', () => {
                const columnGap = 40; // TODO This shouldn't be hard coded.
                let rootElement = iframe.contentDocument.querySelector(':root');
                navPoint.scrollWidth = rootElement.scrollWidth;
                if (navPoint.mediaType === 'application/xhtml+xml') {
                    // Hijack all links
                    this.hijackLinks(rootElement);
                    const cssLink = document.createElement('link');
                    cssLink.rel = 'stylesheet';
                    let baseHref = window.location.href;
                    cssLink.href = `${baseHref.substring(0, baseHref.lastIndexOf('/'))}/`;
                    cssLink.type = 'text/css';
                    cssLink.addEventListener('load', () => {
                        console.log(
                            `Scroll width of chapter ${navPoint.id}: ${navPoint.scrollWidth}`);
                        const navPointIndex = this.navigationList.findIndex(np => {
                            return np.id === navPoint.id;
                        });
                        const currentIndex = this.navigationList.findIndex(np => {
                            return np.id === this.currentNavPoint.id;
                        });
                        const html = iframe.contentDocument.querySelector('head');

                        if (navPoint.id === this.currentNavPoint.id) {
                            let index = this.navigationList.findIndex(np => {
                                return navPoint.id === np.id;
                            });

                            if (index >= 0) {
                                this.chapterTranslateX = index * -(window.innerWidth);
                                console.log(
                                    `Jump to chapter ${index}/${navPoint.id}: ${this.chapterTranslateX}px`);
                                document.body.style.transform = `translateX(${this.chapterTranslateX}px)`;
                                if (this.currentNavPoint.chapterProgress) {
                                    console.log(
                                        `Chapter progress ${this.currentNavPoint.chapterProgress}`);
                                    const path = this.currentNavPoint.chapterProgress.split('/').map(idx => `:nth-child(${idx})`);
                                    const selector = ':root > ' + path.join(' > ');
                                    console.log('CSS selector for progress:', selector);
                                    const progressElement = iframe.contentDocument.querySelector(
                                        selector);
                                    if (progressElement) {
                                        console.log('Scroll to:', progressElement);
                                        const clientRects = progressElement.getClientRects();
                                        this.currentNavPoint.translateX = -clientRects[clientRects.length -
                                        1].x + columnGap;
                                        const html = this.currentFrame.contentDocument.querySelector(
                                            'html');
                                        html.style.transform = `translateX(${this.currentNavPoint.translateX}px)`;
                                    }
                                }
                                console.log(`Rendered ${navPoint.id}`);
                            } else {
                                console.error('Invalid or unexpected navPoint!', navPoint);
                            }
                        } else if (currentIndex > navPointIndex && navPointIndex >= 0) {
                            navPoint.translateX = navPoint.scrollWidth -
                                (window.innerWidth - columnGap);
                            html.style.transform = `translateX(${navPoint.translateX}px)`;
                            console.log(`Position earlier chapter to ${navPoint.translateX}`);
                        } else if (currentIndex < navPointIndex && navPointIndex >= 0) {
                            navPoint.translateX = 0;
                            html.style.transform = `translateX(${navPoint.translateX}px)`;
                            console.log(`Position later chapter to ${navPoint.translateX}`);
                        }
                    });
                    const head = iframe.contentDocument.querySelector('head');
                    if (!head) {
                        console.log('Missing head element!');
                    } else {
                        head.appendChild(cssLink);
                    }
                } else { // This is not HTML
                    if (navPoint.id === this.currentNavPoint.id) {
                        let index = this.navigationList.findIndex(np => {
                            return navPoint.id === np.id;
                        });

                        if (index >= 0) {
                            this.chapterTranslateX = index * -(window.innerWidth);
                            console.log(
                                `Jump to chapter ${index}/${navPoint.id}: ${this.chapterTranslateX}px`);
                            document.body.style.transform = `translateX(${this.chapterTranslateX}px)`;
                        }
                    }
                }
                disableBodyScroll(iframe.contentDocument);
                disableBodyScroll(iframe.contentDocument.body);
                let rootElem = rootElement;
                const detector = new GestureDetector(rootElem);
                detector.onPan = e => this.performPan(e, navPoint);
                detector.onClick = e => this.performClick(e, navPoint);
            });
            iframe.addEventListener('unload', e => console.log('unload', e));
            iframe.src = navPoint.src;
        } else {
            console.log(`Chapter ${iframe.src} already loaded!`);
        }
    }

    previousNavPoint(currentNavPoint) {
        let currentIndex = this.navigationList.findIndex(
            np => currentNavPoint.id === np.id);
        return this.navigationList[currentIndex - 1];
    }

    nextNavPoint(currentNavPoint) {
        let currentIndex = this.navigationList.findIndex(
            np => currentNavPoint.id === np.id);
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

    updateProgress() {
        const columnGap = 40; // TODO This shouldn't be hard coded.
        // TODO Find a better way to pick first element
        const progressElement = this.currentFrame.contentDocument.elementFromPoint(
            window.innerWidth / 2, columnGap);
        if (progressElement && progressElement.tagName.toLocaleLowerCase() !==
            'body') {
            const path = getDomPath(progressElement).join('/');
            console.log('Path for top element:', path);
            console.log('Top element at this page:', progressElement);
            this.currentNavPoint.chapterProgress = path;
        }
        console.log('Store current navPoint:', this.currentNavPoint);
        localStorage.setItem(`${this.href}/currentNavPoint`,
            JSON.stringify(this.currentNavPoint));
    }

    goToChapter(navPoint) {
        let index = this.navigationList.findIndex(np => {
            return navPoint.id === np.id;
        });

        if (index >= 0) {
            this.currentNavPoint = this.navigationList[index];
            this.chapterTranslateX = index * -(window.innerWidth);
            if (this.currentFrame.src !== '') {
                console.log(
                    `Jump to chapter ${index}/${navPoint.id}: ${this.chapterTranslateX}px`);
                document.body.style.transform = `translateX(${this.chapterTranslateX}px)`;
                console.log(`Rendered ${navPoint.id}`);
                this.preloadFrames(this.currentNavPoint);
            } else {
                this.loadChapter(this.currentNavPoint, document.body);
                this.preloadFrames(this.currentNavPoint);
            }
        } else {
            console.error('Invalid or unexpected navPoint!', navPoint);
        }
    }

    nextPage() {
        const columnGap = 40; // TODO This shouldn't be hard coded.
        const screenWidth = window.innerWidth;
        const chapterWidth = this.currentNavPoint.scrollWidth;
        const pageScrollAmount = screenWidth - columnGap;
        const element = this.currentFrame.contentDocument.querySelector(':root');
        console.log('Current frame:', element);
        console.log('Next page:', Math.abs(this.currentNavPoint.translateX),
            screenWidth, chapterWidth);

        let currentId = this.currentNavPoint.id;
        let currentIdx = this.navigationList.findIndex(np => np.id === currentId);
        let nextTranslate = Math.abs(this.currentNavPoint.translateX) + screenWidth;
        if (nextTranslate >= chapterWidth) {
            if (currentIdx === (this.navigationList.length - 1)) {
                console.log('Last page in last chapter - stop here!');
            } else {
                console.log('Scroll to next chapter!');
                this.chapterTranslateX -= screenWidth;

                document.body.addEventListener('transitionend', e => {
                    document.body.style.transition = 'unset';
                    this.updateProgress();
                }, {once: true});
                document.body.style.transition = 'transform 200ms';
                document.body.style.transform = `translateX(${this.chapterTranslateX}px)`;
                this.currentNavPoint = this.nextNavPoint(this.currentNavPoint);
                this.preloadFrames(this.currentNavPoint);
                console.log('New chapter:', this.currentNavPoint, this.currentFrame);
            }
        } else {
            console.log('Scroll to next page.');
            this.currentNavPoint.translateX -= pageScrollAmount;
            element.addEventListener('transitionend', e => {
                element.style.transition = 'unset';
                this.updateProgress();
            }, {once: true});
            element.style.transition = 'transform 200ms';
            element.style.transform = `translateX(${this.currentNavPoint.translateX}px)`;
        }
    }

    previousPage() {
        const columnGap = 40; // TODO This shouldn't be hard coded.
        const screenWidth = window.innerWidth;
        const pageScrollAmount = screenWidth - columnGap;
        const element = this.currentFrame.contentDocument.querySelector(':root');
        console.log('Current frame:', element);
        console.log('Previous page:', Math.abs(this.currentNavPoint.translateX),
            screenWidth);

        if (this.currentNavPoint.translateX === 0) {
            if (this.currentNavPoint.id === this.navigationList[0].id) {
                console.log('First page in first chapter - ignore!');
            } else {
                console.log('Scroll to previous chapter!');
                this.chapterTranslateX += screenWidth;

                document.body.addEventListener('transitionend', e => {
                    document.body.style.transition = 'unset';
                    this.updateProgress();
                }, {once: true});
                document.body.style.transition = 'transform 200ms';
                document.body.style.transform = `translateX(${this.chapterTranslateX}px)`;
                this.currentNavPoint = this.previousNavPoint(this.currentNavPoint);
                this.preloadFrames(this.currentNavPoint);
                console.log('New chapter:', this.currentNavPoint, this.currentFrame);
            }
        } else {
            console.log('Scroll to previous chapter.');
            this.currentNavPoint.translateX += pageScrollAmount;
            element.addEventListener('transitionend', e => {
                element.style.transition = 'unset';
                this.updateProgress();
            }, {once: true});
            element.style.transition = 'transform 200ms';
            element.style.transform = `translateX(${this.currentNavPoint.translateX}px)`;
        }
    }

    // TODO Lots of duplicated code from performPan.
    performClick(event, navPoint) {
        console.log(`Click at ${event.screenX}`);
        if (event.screenX < (window.innerWidth * 0.2)) {
            this.previousPage();
        } else if (event.screenX > (window.innerWidth * 0.8)) {
            this.nextPage();
        } else {
            console.log('Center click ignored!');
        }
    }

    performPan(event, navPoint) {
        const direction = event.deltaX > 0 ? -1 : 1;
        const columnGap = 40; // TODO This shouldn't be hard coded.
        const element = event.target;
        const screenWidth = window.innerWidth;
        const pageScrollWidth = window.innerWidth - columnGap;
        const maxScroll = navPoint.scrollWidth - columnGap;
        const chapterWidth = this.currentNavPoint.scrollWidth;
        const currentFrame = document.querySelector(`#${navPoint.id}`);

        console.log('Direction', direction);
        console.log('navPoint.translateX', navPoint.translateX);
        console.log('maxScroll', maxScroll);
        console.log('pageScrollWidth', pageScrollWidth);
        console.log('Final event:', event.isFinal);
        console.log('First event:', event.isFirst);

        let currentId = this.currentNavPoint.id;
        let currentIdx = this.navigationList.findIndex(np => np.id === currentId);
        let nextPageTranslate = Math.abs(this.currentNavPoint.translateX) +
            screenWidth;

        const crossedThreshold = Math.abs(event.deltaX) > 0.5 * screenWidth;
        if (direction === 1) { // back
            if (this.currentNavPoint.translateX === 0) { // chapter
                if (this.currentNavPoint.id === this.navigationList[0].id) {
                    console.log('First page in first chapter - ignore!');
                } else {
                    if (event.isFinal) {
                        if (crossedThreshold) {
                            this.previousPage();
                        } else {
                            document.body.addEventListener('transitionend', e => {
                                document.body.style.transition = 'unset';
                            }, {once: true});
                            document.body.style.transition = 'transform 200ms';
                            document.body.style.transform = `translateX(${this.chapterTranslateX}px)`;
                        }
                    } else {
                        const currentTranslateX = this.chapterTranslateX - event.deltaX;
                        document.body.style.transform = `translateX(${currentTranslateX}px)`;
                    }
                }
            } else { // page
                if (event.isFinal) {
                    if (crossedThreshold) {
                        this.previousPage();
                    } else {
                        element.addEventListener('transitionend', e => {
                            element.style.transition = 'unset';
                        }, {once: true});
                        element.style.transition = 'transform 200ms';
                        element.style.transform = `translateX(${navPoint.translateX}px)`;
                    }
                } else {
                    let pageTranslate = navPoint.translateX - event.deltaX;
                    element.addEventListener('transitionend', e => {
                        element.style.transition = 'unset';
                    }, {once: true});
                    element.style.transition = 'transform 200ms';
                    element.style.transform = `translateX(${pageTranslate}px)`;
                }
            }
        } else { //forward
            if (nextPageTranslate >= maxScroll) { // chapter
                if (currentIdx === (this.navigationList.length - 1)) {
                    console.log('Last page in last chapter - ignore');
                } else {
                    if (event.isFinal) {
                        if (crossedThreshold) {
                            this.nextPage();
                        } else {
                            document.body.addEventListener('transitionend', e => {
                                document.body.style.transition = 'unset';
                            }, {once: true});
                            document.body.style.transition = 'transform 200ms';
                            document.body.style.transform = `translateX(${this.chapterTranslateX}px)`;
                        }
                    } else {
                        const currentTranslateX = this.chapterTranslateX - event.deltaX;
                        document.body.addEventListener('transitionend', e => {
                            document.body.style.transition = 'unset';
                        }, {once: true});
                        document.body.style.transition = 'transform 200ms';
                        document.body.style.transform = `translateX(${currentTranslateX}px)`;
                    }
                }
            } else { // page
                if (event.isFinal) {
                    if (crossedThreshold) {
                        this.nextPage();
                    } else {
                        element.addEventListener('transitionend', e => {
                            element.style.transition = 'unset';
                        }, {once: true});
                        element.style.transition = 'transform 200ms';
                        element.style.transform = `translateX(${navPoint.translateX}px)`;
                    }
                } else {
                    let pageTranslate = navPoint.translateX - event.deltaX;
                    element.addEventListener('transitionend', e => {
                        element.style.transition = 'unset';
                    }, {once: true});
                    element.style.transition = 'transform 200ms';
                    element.style.transform = `translateX(${pageTranslate}px)`;
                }
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

    static buildNavigationFromSpine(opfDoc, basePath) {
        const manifest = opfDoc.querySelector('manifest');
        const spine = opfDoc.querySelector('spine');
        const spineItems = Array.from(spine.querySelectorAll('itemref'));
        const guide = opfDoc.querySelector('guide');
        const references = guide ? Array.from(guide.querySelectorAll('reference')) : [];

        return spineItems
            .filter(itemref => {
                const linear = itemref.getAttribute('linear');
                if (linear) {
                    return linear.toLowerCase() === 'yes';
                }
                return true; // Default to linear === yes
            })
            .map((itemref, index) => {
                const idref = itemref.getAttribute('idref');
                const item = manifest.querySelector(`#${idref}`);
                const id = item.getAttribute('id');
                const mediaType = item.getAttribute('media-type');
                const href = item.getAttribute('href');
                const reference = references.find(ref => {
                    return ref.getAttribute('href') === href;
                });

                let title = '';
                if (reference && reference.hasAttribute('title')) {
                    title = reference.getAttribute('title');
                }

                return {
                    mediaType: mediaType,
                    playOrder: index,
                    src: `${basePath}/${href}`,
                    id: id,
                    label: title,
                    translateX: 0,
                    chapterProgress: null,
                };
            })
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
            const contentSrc = Epub.findChildNode(p,
                n => n.tagName === 'content').getAttribute('src');
            const playOrder = parseInt(p.getAttribute('playOrder'));
            const id = p.getAttribute('id');
            const itemClass = p.getAttribute('class');
            const label = Epub.findChildNode(p,
                n => n.tagName === 'navLabel').querySelector('text').innerText;
            return {
                playOrder: playOrder,
                src: `${basePath}/${contentSrc}`,
                id: id,
                itemClass: itemClass,
                label: label,
                translateX: 0,
                chapterProgress: null,
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
    static get CLICK_DELAY_MS() {
        return 500;
    }

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
                    timestamp: new Date().getTime(),
                    screenX: event.touches[0].screenX,
                    screenY: event.touches[0].screenY,
                };
                this.emitDragEvent(this.startCoords, false, true);
                break;
            case 'touchmove':
                const screenCoords = {
                    timestamp: new Date().getTime(),
                    screenX: event.touches[0].screenX,
                    screenY: event.touches[0].screenY,
                };
                this.emitDragEvent(screenCoords, false, false);
                this.previousCoords = screenCoords;
                break;
            case 'touchend':
            case 'touchcancel':
                this.state = 'passive';
                const now = new Date().getTime();
                if (this.previousCoords) {
                    this.emitDragEvent(this.previousCoords, true, false);
                } else if (now - this.startCoords.timestamp <=
                    GestureDetector.CLICK_DELAY_MS) {
                    this.emitClickEvent(this.startCoords);
                }
                this.previousCoords = null;
                this.startCoords = null;
                break;
            case 'mousedown':
                this.state = 'dragging';
                this.startCoords = {
                    timestamp: new Date().getTime(),
                    screenX: event.screenX,
                    screenY: event.screenY,
                };
                break;
            case 'mousemove':
                if (this.state === 'dragging') {
                    const screenCoords = {
                        timestamp: new Date().getTime(),
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
                    const now = new Date().getTime();
                    if (this.previousCoords) {
                        this.emitDragEvent(this.previousCoords, true, false);
                    } else if (now - this.startCoords.timestamp <=
                        GestureDetector.CLICK_DELAY_MS) {
                        this.emitClickEvent(this.startCoords);
                    }
                    this.previousCoords = null;
                    this.startCoords = null;
                }
                break;
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

function buildSelector(path) {
    return path.map(idx => `nth-child(${idx})`).join(' > ');
}

function getDomPath(el) {
    const stack = [];
    while (el.parentNode != null) {
        console.log(el.nodeName);
        let sibCount = 0;
        let sibIndex = 0;
        for (let i = 0; i < el.parentNode.childNodes.length; i++) {
            const sib = el.parentNode.childNodes[i];
            if (sib === el) {
                sibIndex = sibCount;
            }
            if (sib.nodeType === Node.ELEMENT_NODE) {
                sibCount++;
            }
        }
        stack.unshift(sibIndex + 1);
        el = el.parentNode;
    }

    return stack.slice(1);
}

let epub;
(async () => {
    console.log('Start loading book!');
    const urlParams = new URLSearchParams(window.location.search);
    const book = urlParams.get('book');
    if (!book) {
        alert('Missing required book parameter!');
        return;
    }
    const response = await fetch(`books/${book}/mimetype`);
    if (response.status >= 400) {
        alert(`Couldn't find book at books/${book}`);
        return;
    }
    const mimetype = (await response.text()).trim();
    if (mimetype !== 'application/epub+zip') {
        alert(`Invalid book type. Expecting "application/epub+zip" but got ${mimetype}`);
        return;
    }

    const chapter = urlParams.get('chapter');
    const progress = urlParams.get('progress');
    epub = await Epub.create(`books/${book}`);
    disableBodyScroll(document.querySelector(':root'));
    disableBodyScroll(document.querySelector('body'));
    epub.renderBook(document.body);
    const item = localStorage.getItem(`${epub.href}/currentNavPoint`);
    const storedNavPoint = JSON.parse(item);
    const chapterNavPoint = epub.navigationList.find(np => np.id === chapter);
    if (chapterNavPoint) {
        epub.currentNavPoint = chapterNavPoint;
        if (progress) {
            epub.currentNavPoint.chapterProgress = progress;
        }
    } else if (storedNavPoint) {
        epub.currentNavPoint = epub.navigationList.find(np => {
            return np.id === storedNavPoint.id;
        });
        epub.currentNavPoint.chapterProgress = storedNavPoint.chapterProgress;
    } else {
        epub.currentNavPoint = epub.navigationList[0];
    }
    console.log('Load navPoint', epub.currentNavPoint);
    epub.loadChapter(epub.currentNavPoint, document.body);
    epub.preloadFrames(epub.currentNavPoint);
    console.log('Book loaded!');
})();
