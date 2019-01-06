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
    this.navigationList.map(navPoint => this.loadIframe(navPoint)).
        forEach(iframe => rootElement.appendChild(iframe));
  }

  loadIframe(navPoint) {
    const iframe = document.createElement('iframe');
    iframe.src = navPoint.src;
    iframe.id = navPoint.id;
    iframe.addEventListener('load', () => {
      const cssLink = document.createElement('link');
      cssLink.rel = 'stylesheet';
      cssLink.href = '/resource.css';
      cssLink.type = 'text/css';
      iframe.contentDocument.head.appendChild(cssLink);
    });
    return iframe;
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
      };
    }).sort((a, b) => {
      return a.playOrder - b.playOrder;
    });
  }

  static findChildNode(doc, predicate) {
    return Array.from(doc.childNodes.values()).find(predicate);
  }
}

(async () => {
  const epub = await Epub2Resource.create('books/book1');
  console.log(epub);
  epub.renderBook(document.body);
})();
