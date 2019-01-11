'use strict';

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
        const options = {
            passive: true,
            capture: true
        };
        /*
                element.addEventListener('touchstart', this.onEvent.bind(this));
                element.addEventListener('touchmove', this.onEvent.bind(this));
                element.addEventListener('touchend', this.onEvent.bind(this));
                element.addEventListener('touchcancel', this.onEvent.bind(this));
                element.addEventListener('mousedown', this.onEvent.bind(this));
                element.addEventListener('mousemove', this.onEvent.bind(this));
                element.addEventListener('mouseup', this.onEvent.bind(this));
                element.addEventListener('mouseleave', this.onEvent.bind(this));
        */
        element.addEventListener('pointerdown', this.onEvent.bind(this), options);
        element.addEventListener('pointermove', this.onEvent.bind(this), options);
        element.addEventListener('pointerup', this.onEvent.bind(this), options);
        // element.addEventListener('pointerleave', this.onEvent.bind(this));
        // element.addEventListener('pointerout', this.onEvent.bind(this));
        // element.addEventListener('click', e => this.onEvent(e));
        console.log('Added gesture detector to ', element);
    }

    onEvent(event) {
        // console.log(event.type, event.timeStamp);
        // console.log(event.type, event.clientX);
        switch (event.type) {
            /*
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
            */
            // case 'mousedown':
            case 'pointerdown':
                // this.element.setPointerCapture(event.pointerId);
                this.state = 'dragging';
                this.startCoords = {
                    timestamp: event.timeStamp,
                    screenX: event.clientX,
                    screenY: event.clientY,
                };
                break;
            // case 'mousemove':
            case 'pointermove':
                if (this.state === 'dragging') {
                    const screenCoords = {
                        timestamp: event.timeStamp,
                        screenX: event.clientX,
                        screenY: event.clientY,
                    };
                    this.emitDragEvent(screenCoords, false, false);
                    this.previousCoords = screenCoords;
                }
                break;
            // case 'mouseup':
            // case 'mouseleave':
            case 'pointerup':
                // case 'pointerout':
                console.log('timestamp delta:', event.timeStamp - this.startCoords.timestamp);
                if ((event.timeStamp - this.startCoords.timestamp) <= GestureDetector.CLICK_DELAY_MS) {
                    this.emitClickEvent(this.startCoords);
                }

                if (this.state === 'dragging' && this.previousCoords) {
                    this.emitDragEvent(this.previousCoords, true, false);
                }
                this.state = 'passive';
                this.previousCoords = null;
                this.startCoords = null;
                // this.element.releasePointerCapture(event.pointerId);
                break;
            default:
                console.log('Unexpected event:', event);
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
        console.log('drag', coordinates);
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
