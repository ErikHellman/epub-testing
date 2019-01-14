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
        const options = {capture: true};
        // Use PointerEvents, at least for Chrome
        element.addEventListener('pointerdown', this.onEvent.bind(this), options);
        element.addEventListener('pointermove', this.onEvent.bind(this), options);
        element.addEventListener('pointerup', this.onEvent.bind(this), options);
        console.log('Added gesture detector to ', element);
    }

    onEvent(event) {
        event.preventDefault();
        switch (event.type) {
            case 'pointerdown':
                event.target.setPointerCapture(event.pointerId);
                this.state = 'dragging';
                this.startCoords = {
                    timestamp: event.timeStamp,
                    screenX: event.clientX,
                    screenY: event.clientY,
                };
                break;
            case 'pointermove':
                if (this.state === 'dragging') {
                    const screenCoords = {
                        timestamp: event.timeStamp,
                        screenX: event.clientX,
                        screenY: event.clientY,
                    };
                    const deltaX = this.startCoords.screenX - screenCoords.screenX;
                    if (Math.abs(deltaX) > 10) {
                        this.emitDragEvent(screenCoords, false, false);
                    }
                    this.previousCoords = screenCoords;
                }
                break;
                case 'pointerup':
                case 'pointercancel':
                const timeStampDelta = event.timeStamp - this.startCoords.timestamp;
                console.log('timestamp delta:', timeStampDelta);
                if (timeStampDelta <= GestureDetector.CLICK_DELAY_MS) {
                    this.emitClickEvent(this.startCoords);
                } else if (this.state === 'dragging' && this.previousCoords) {
                    this.emitDragEvent(this.previousCoords, true, false);
                }
                this.state = 'passive';
                this.previousCoords = null;
                this.startCoords = null;
                event.target.releasePointerCapture(event.pointerId);
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
