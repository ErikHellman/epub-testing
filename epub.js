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
        this.rafPending = false;
        this.panThreshold = 0.5;
        this.columnGap = 40;
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

        // Keyboard navigation
        window.addEventListener('keyup', event => {
            console.log(event.type, event);

            if (event.code === 'ArrowRight' || event.code === 'Space') {
                this.nextPage();
            } else if (event.code === 'ArrowLeft') {
                this.previousPage();
            }
        });
    }

    renderBook(rootElement) {
        disableBodyScroll(document.querySelector(':root'));
        disableBodyScroll(document.querySelector('body'));
        
        this.navigationList.forEach(navPoint => {
                Epub.createIFrame(navPoint, rootElement);
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

    moveToCurrentNavPoint() {
        let index = this.navigationList.findIndex(np => {
            return this.currentNavPoint.id === np.id;
        });
        console.log(`Move to resource index ${index}:`, this.currentNavPoint);

        if (index >= 0) {
            this.chapterTranslateX = index * -(window.innerWidth);
            document.body.style.transform = `translateX(${this.chapterTranslateX}px)`;
            if (this.currentNavPoint.chapterProgress) {
                console.log(`Chapter progress ${this.currentNavPoint.chapterProgress}`);
                const path = this.currentNavPoint.chapterProgress.split('/').map(idx => `:nth-child(${idx})`);
                const selector = `:root > ${path.join(' > ')}`;
                console.log('CSS selector for progress:', selector);
                const progressElement = this.currentFrame.contentDocument.querySelector(selector);
                const rootElement = this.currentFrame.contentDocument.querySelector(':root');
                if (progressElement) {
                    const clientRects = progressElement.getClientRects();
                    console.log('Scroll to:', progressElement, clientRects);
                    if (clientRects) {
                        this.currentNavPoint.translateX = -clientRects[0].x + this.columnGap;
                        rootElement.style.transform = `translateX(${this.currentNavPoint.translateX}px)`;    
                    }
                }
            }
        } else {
            console.error('Invalid or unexpected navPoint!', navPoint);
        }
    }

    loadChapter(navPoint, rootElement) {
        const iframe = rootElement.querySelector(`#${navPoint.id}`);
        if (iframe.src === '') {
            iframe.addEventListener('load', () => {
                let rootElement = iframe.contentDocument.querySelector(':root');
                rootElement.style.transition = 'none';
                navPoint.scrollWidth = rootElement.scrollWidth;
                console.log(`Loaded chapter ${navPoint.src} with widht ${navPoint.scrollWidth}`);

                // Touch gestures
                const detector = new GestureDetector(rootElement);
                detector.onPan = e => this.performPan(e, navPoint);
                detector.onClick = e => this.performClick(e, navPoint);

                if (navPoint.mediaType === 'application/xhtml+xml') {
                    // Hijack all links
                    this.hijackLinks(rootElement);

                    // Setup CSS
                    const cssLink = document.createElement('link');
                    cssLink.rel = 'stylesheet';
                    let baseHref = window.location.href;
                    cssLink.href = `${baseHref.substring(0, baseHref.lastIndexOf('/'))}/resource.css`;
                    cssLink.type = 'text/css';

                    cssLink.addEventListener('load', () => {
                        navPoint.scrollWidth = rootElement.scrollWidth;
                        console.log(`CSS loaded. Scroll width of chapter ${navPoint.id}: ${navPoint.scrollWidth}`);
                        const navPointIndex = this.navigationList.findIndex(np => {
                            return np.id === navPoint.id;
                        });
                        const currentIndex = this.navigationList.findIndex(np => {
                            return np.id === this.currentNavPoint.id;
                        });

                        if (navPoint.id === this.currentNavPoint.id) {
                            this.moveToCurrentNavPoint();
                        } else if (currentIndex > navPointIndex && navPointIndex >= 0) {
                            navPoint.translateX = navPoint.scrollWidth - (window.innerWidth - this.columnGap);
                            rootElement.style.transform = `translateX(${navPoint.translateX}px)`;
                            console.log(`Position earlier chapter to ${navPoint.translateX}`);
                        } else if (currentIndex < navPointIndex && navPointIndex >= 0) {
                            navPoint.translateX = 0;
                            rootElement.style.transform = `translateX(${navPoint.translateX}px)`;
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
                rootElement.focus();
            });
            iframe.addEventListener('unload', e => console.log('unload', e));
            iframe.src = navPoint.src;
        } else {
            console.log(`Chapter ${iframe.src} already loaded!`);
            iframe.contentDocument.querySelector(':root').focus();
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

        this.loadChapter(navPoint, document.body);
    }

    updateProgress() {
        // TODO Find a better way to pick first element
        const progressElement = this.currentFrame.contentDocument.elementFromPoint(
            window.innerWidth / 2, this.columnGap);
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
        this.currentFrame.contentDocument.querySelector(':root').focus();
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
            this.updateProgress();
        } else {
            console.error('Invalid or unexpected navPoint!', navPoint);
        }
    }

    applyTranslationWithTransition(element, translateX) {
        element.addEventListener('transitionend', e => {
            element.style.transition = 'none';
            this.updateProgress();
        }, {once: true});
        // TODO Would window.requestAnimationFrame() improve this?
/*         if (this.rafPending) {
            return;
        }
        this.rafPending = true
        window.requestAnimationFrame(ts => {
            if (!this.rafPending) return;

 */
            element.style.transition = 'transform 200ms';
            element.style.transform = `translateX(${translateX}px)`
            console.log('applyTranslationWithTransition:', translateX), element;

/*             this.rafPending = false;
        })
 */    }

    nextPage() {
        const screenWidth = window.innerWidth;
        const chapterWidth = this.currentNavPoint.scrollWidth;
        const pageScrollAmount = screenWidth - this.columnGap;
        const element = this.currentFrame.contentDocument.querySelector(':root');
        console.log('Current frame:', element);
        console.log('Next page:', Math.abs(this.currentNavPoint.translateX), screenWidth, chapterWidth);

        let currentId = this.currentNavPoint.id;
        let currentIdx = this.navigationList.findIndex(np => np.id === currentId);
        let nextTranslate = Math.abs(this.currentNavPoint.translateX) + screenWidth;
        if (nextTranslate >= chapterWidth) {
            if (currentIdx === (this.navigationList.length - 1)) {
                console.log('Last page in last chapter - stop here!');
            } else {
                console.log('Scroll to next chapter!');
                this.chapterTranslateX -= screenWidth;

                this.applyTranslationWithTransition(document.body, this.chapterTranslateX);
                this.currentNavPoint = this.nextNavPoint(this.currentNavPoint);
                this.preloadFrames(this.currentNavPoint);
                console.log('New chapter:', this.currentNavPoint, this.currentFrame);
            }
        } else {
            console.log('Scroll to next page.');
            this.currentNavPoint.translateX -= pageScrollAmount;
            this.applyTranslationWithTransition(element, this.currentNavPoint.translateX);
            this.preloadFrames(this.currentNavPoint);
        }
    }

    previousPage() {
        const screenWidth = window.innerWidth;
        const pageScrollAmount = screenWidth - this.columnGap;
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

                this.applyTranslationWithTransition(document.body, this.chapterTranslateX);
                this.currentNavPoint = this.previousNavPoint(this.currentNavPoint);
                this.preloadFrames(this.currentNavPoint);
                console.log('New chapter:', this.currentNavPoint, this.currentFrame);
            }
        } else {
            console.log('Scroll to previous chapter.');
            this.currentNavPoint.translateX += pageScrollAmount;
            this.applyTranslationWithTransition(element, this.currentNavPoint.translateX);
            this.preloadFrames(this.currentNavPoint);
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

    applyPanTranslation(element, translation) {
/*         if (this.rafPending) {
            return;
        }

        this.rafPending = true;

        window.requestAnimationFrame(event => {
            if (!this.rafPending) {
                return;
            }
 */                
        element.style.transform = `translateX(${translation}px)`;

/*             this.rafPending = false
        })
 */    }

    performPan(event, navPoint) {
        const direction = event.deltaX > 0 ? -1 : 1;
        const element = event.target;
        const screenWidth = window.innerWidth;
        const pageScrollWidth = window.innerWidth - this.columnGap;
        const maxScroll = navPoint.scrollWidth - this.columnGap;
        const chapterWidth = this.currentNavPoint.scrollWidth;
        const currentFrame = document.querySelector(`#${navPoint.id}`);

        console.log('Target element:', element);
        console.log('Direction', direction);
        console.log('navPoint.translateX', navPoint.translateX);
        console.log('maxScroll', maxScroll);
        console.log('pageScrollWidth', pageScrollWidth);
        console.log('DeltaX:', event.deltaX);
        console.log('Final event:', event.isFinal);
        console.log('First event:', event.isFirst);

        let currentId = this.currentNavPoint.id;
        let currentIdx = this.navigationList.findIndex(np => np.id === currentId);
        let nextPageTranslate = Math.abs(this.currentNavPoint.translateX) +
            screenWidth;

        const crossedThreshold = Math.abs(event.deltaX) > (this.panThreshold * screenWidth);
        console.log('Crossed threshold:', crossedThreshold);
        if (direction === 1) { // back
            if (this.currentNavPoint.translateX === 0) { // chapter
                if (this.currentNavPoint.id === this.navigationList[0].id) {
                    console.log('First page in first chapter - ignore!');
                    return;
                } else {
                    if (event.isFinal) {
                        if (crossedThreshold) {
                            this.previousPage();
                        } else {
                            document.body.style.transition = 'transform 200ms';
                            document.body.addEventListener('transitionend', e => {
                                document.body.style.transition = 'none';
                            }, {once: true});
                            window.requestAnimationFrame(ts => {
                                document.body.style.transform = `translateX(${this.chapterTranslateX}px)`;
                                console.log('Release chapter pan:', navPoint.translateX)        
                            })
                        }
                    } else {
                        const currentTranslateX = this.chapterTranslateX - event.deltaX;
                        this.applyPanTranslation(document.body, currentTranslateX);
                    }
                }
            } else { // page
                if (event.isFinal) {
                    if (crossedThreshold) {
                        this.previousPage();
                    } else {
                        element.style.transition = 'transform 200ms';
                        element.addEventListener('transitionend', e => {
                            element.style.transition = 'none';
                        }, {once: true});
                        window.requestAnimationFrame(ts => {
                            element.style.transform = `translateX(${navPoint.translateX}px)`;
                            console.log('Release chapter pan:', this.chapterTranslateX)        
                        })
                    }
                } else {
                    let pageTranslate = navPoint.translateX - event.deltaX;
                    this.applyPanTranslation(element, pageTranslate);
                }
            }
        } else { //forward
            if (nextPageTranslate >= maxScroll) { // chapter
                if (currentIdx === (this.navigationList.length - 1)) {
                    console.log('Last page in last chapter - ignore');
                    return;
                } else {
                    if (event.isFinal) {
                        if (crossedThreshold) {
                            this.nextPage();
                        } else {
                            document.body.style.transition = 'transform 200ms';
                            document.body.addEventListener('transitionend', e => {
                                document.body.style.transition = 'none';
                            }, {once: true});
                            window.requestAnimationFrame(ts => {
                                document.body.style.transform = `translateX(${this.chapterTranslateX}px)`;
                                console.log('Release chapter pan:', this.chapterTranslateX)    
                            })
                        }
                    } else {
                        const currentTranslateX = this.chapterTranslateX - event.deltaX;
                        this.applyPanTranslation(document.body, currentTranslateX);
                    }
                }
            } else { // page
                if (event.isFinal) {
                    if (crossedThreshold) {
                        this.nextPage();
                    } else {
                        element.style.transition = 'transform 200ms';
                        element.addEventListener('transitionend', e => {
                            element.style.transition = 'none';
                        }, {once: true});
                        window.requestAnimationFrame(ts => {
                            element.style.transform = `translateX(${navPoint.translateX}px)`;
                            console.log('Release page pan:', navPoint.translateX)    
                        }); 
                    }
                } else {
                    let pageTranslate = navPoint.translateX - event.deltaX;
                    this.applyPanTranslation(element, pageTranslate);
                }
            }
        }
    }

    static createIFrame(navPoint, parent) {
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

    const epub = await Epub.create(`books/${book}`);
    window.epub = epub;
    epub.renderBook(document.body);

    // From query paramaeters
    const chapterNavPoint = epub.navigationList.find(np => np.id === chapter);

    // From local storage
    const item = localStorage.getItem(`${epub.href}/currentNavPoint`);
    const storedNavPoint = JSON.parse(item);

    if (chapterNavPoint) { // Take query params first
        epub.currentNavPoint = chapterNavPoint;
        if (progress) {
            epub.currentNavPoint.chapterProgress = progress;
        }
    } else if (storedNavPoint) { // Then local storage
        epub.currentNavPoint = epub.navigationList.find(np => {
            return np.id === storedNavPoint.id;
        });
        epub.currentNavPoint.chapterProgress = storedNavPoint.chapterProgress;
    } else { // Finally, start with first chapter
        epub.currentNavPoint = epub.navigationList[0];
    }

    console.log('Load navPoint', epub.currentNavPoint);
    epub.loadChapter(epub.currentNavPoint, document.body);
    epub.preloadFrames(epub.currentNavPoint);
    console.log('Book loaded!');
})();
