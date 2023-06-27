import MusicPlayer from "../MusicPlayer";
import { Mouse2SVG } from "../utils/Mouse2SVG";
import Handler from "./Handler";
import * as coordinates from "../utils/coordinates";
import { constants as c } from '../constants'
import Annotations from "../gui/Annotations";
import { NewNote } from "../utils/Types";
import Cursor from "../gui/Cursor";
import PhantomElementHandler from "./PhantomElementHandler";
import * as cq from "../utils/convenienceQueries"


class ClickModeHandler implements Handler {
    m2s?: Mouse2SVG;
    musicPlayer?: MusicPlayer;
    currentMEI?: string | Document;
    annotations: Annotations;
    private phantomElementHandler: PhantomElementHandler
    insertCallback: (newNote: NewNote, replace: Boolean) => Promise<any>;
    deleteCallback: (notes: Array<Element>) => Promise<any>;

    private containerId: string
    private vrvSVG: Element
    private interactionOverlay: Element
    private container: Element

    setListeners() {
        this.interactionOverlay.addEventListener('click', this.clickHandler)
        this.interactionOverlay.addEventListener("mousemove", this.mouseOverChordHandler)
        this.interactionOverlay.querySelectorAll("#scoreRects > *").forEach(sr => {
            if (["clef", "meterSig", "keySig", "rest", "notehead", "harm", ].some(c => sr.classList.contains(c))) { 
                sr.addEventListener("mouseover", this.hideCursor)
            }else{
                sr.addEventListener("mouseover", this.showCursor)
            }
        })

        this.interactionOverlay.querySelectorAll("#manipulatorCanvas *, #annotationCanvas *").forEach(sr => {
            sr.addEventListener("mouseover", this.hideCursor)
            sr.addEventListener("mouseleave", this.showCursor)
        })

        // Listener just for staves
        var staves = this.interactionOverlay.querySelectorAll(".staffLine")
        Array.from(staves).forEach(element => {
            element.addEventListener('click', this.clickHandler)
        })
    }

    removeListeners() {
        this.interactionOverlay.removeEventListener('click', this.clickHandler)
        this.interactionOverlay.removeEventListener("mousemove", this.mouseOverChordHandler)
        if (this.annotations != undefined) {
            var highLightElements: NodeListOf<Element> = this.annotations.getAnnotationCanvas().querySelectorAll(".highlightChord")
            Array.from(highLightElements).forEach(el => {
                el.remove()
            })
        }

        this.container.querySelectorAll(".highlighted").forEach((c: Element) => {
            c.classList.remove("highlighted")
        })

        this.interactionOverlay.querySelectorAll("#scoreRects > *").forEach(sr => {
            if (["clef", "meterSig", "keySig", "rest", "notehead", "harm"].some(c => sr.classList.contains(c))) { 
                sr.removeEventListener("mouseover", this.hideCursor)
            }else{
                sr.removeEventListener("mouseover", this.showCursor)
            }
        })

        // Listener just for staves
        var staves = this.interactionOverlay.querySelectorAll(".staffLine")
        Array.from(staves).forEach(element => {
            element.removeEventListener('click', this.clickHandler)
        })
    }

    resetListeners() {
        this.removeListeners()
        this.setListeners()
    }

    /**
     * Event handler for inserting Notes
     */
    clickHandler = (function clickHandler(e: MouseEvent): void {
        var t = (e.target as Element)
        if(this.interactionOverlay.querySelector(".moving") !== null) return
        if (["clef", "meterSig", "keySig", "rest", "notehead"].some(c => t.parentElement.classList.contains(c))) {
            this.hideCursor()
            return 
        }
        // when over other interactable elements discard event
        if (!this.phantomElementHandler.getIsTrackingMouse()) { return }
        if (this.musicPlayer.getIsPlaying() === true) { return } // getIsPlaying could also be undefined

        // var pt = new DOMPoint(e.clientX, e.clientY)
        // var vrvSVG = this.vrvSVG as unknown as SVGGraphicsElement
        // var pospt = pt.matrixTransform(vrvSVG.getScreenCTM().inverse())
        var pospt = coordinates.transformToDOMMatrixCoordinates(e.clientX, e.clientY, this.vrvSVG)

        var posx = pospt.x
        var posy = pospt.y
        var target = e.target as HTMLElement;
        var options = {}

        if (target.classList.contains("staffLine")) {
            options["staffLineId"] = target.id
        }
        if (this.interactionOverlay.querySelector("#phantomNote")?.classList.contains("onChord")) {
            options["targetChord"] = this.findScoreTarget(posx, posy)
        }

        //this.m2s.defineNote(e.pageX, e.pageY, options);
        this.m2s.defineNote(posx, posy, options);

        var newNote: NewNote = this.m2s.getNewNote()
        if (newNote == undefined) return //Eingabemaske in Chrome: zusätzliche Notenlinien in Noteneditor #10
        var meiDoc = this.m2s.getCurrentMei()
        var pitchExists: Boolean = false

        // do not insert same note more than once in chord
        if (newNote.chordElement != undefined) {
            var chordEl = meiDoc.getElementById(newNote.chordElement.id)
            if (chordEl.getAttribute("pname") === newNote.pname && chordEl.getAttribute("oct") === newNote.oct) {
                pitchExists = true
            } else {
                for (let c of chordEl.children) {
                    if (c.getAttribute("pname") === newNote.pname && c.getAttribute("oct") === newNote.oct) {
                        pitchExists = true
                        break
                    }
                }
            }
        }

        if (!pitchExists) {
            var replace = (this.container.querySelector("#insertToggle") as HTMLInputElement).checked && newNote.chordElement == undefined
            this.insertCallback(this.m2s.getNewNote(), replace).then(() => {
                this.musicPlayer.generateTone(this.m2s.getNewNote())
            }).catch(() => {
                //alert("Your bar is to small")
            })
        }
    }).bind(this)

    hideCursor = function(){
        if(this.interactionOverlay.querySelector(".moving") !== null) return
        this.container.querySelectorAll("#phantomCanvas > *").forEach(ph => {
            ph.setAttribute("visibility", "hidden")
        }) // make phantoms invisible
    }.bind(this)

    showCursor = function(){
        this.container.querySelectorAll("#phantomCanvas > *").forEach(ph => ph.setAttribute("visibility", "visible")) // make phantoms invisible
    }.bind(this)




    mouseOverChordHandler = (function mouseOverHandler(e: MouseEvent): void {
        if (!this.phantomElementHandler.getIsTrackingMouse()) { return }
        var coords = coordinates.transformToDOMMatrixCoordinates(e.clientX, e.clientY, this.interactionOverlay)
        var posx = coords.x//e.offsetX
        var posy = coords.y//e.offsetY

        var elementToHighlight: Element = this.findScoreTarget(posx, posy)
        if (elementToHighlight == undefined || elementToHighlight.closest(".mRest") !== null || elementToHighlight.closest(".rest") !== null) { return }
        if (this.prevElementToHighlight == undefined || this.currentElementToHighlight !== elementToHighlight) {


            //update focussed layer if element and layer do not match
            if (elementToHighlight.closest(".layer").id !== this.m2s.getMouseEnterElementByName("layer")?.id && this.m2s.getMouseEnterElementByName("layer") !== null) {
                this.m2s.setMouseEnterElements(elementToHighlight)
            }

            //snap note to closest Chord
            var phantom = this.interactionOverlay.querySelector("#phantomNote")
            var cx = parseFloat(phantom.getAttribute("cx"))

            var bboxElement = this.interactionOverlay.querySelector("[refId=" + elementToHighlight.id + "]")
            var ptLeft = new DOMPoint(bboxElement.getBoundingClientRect().left, 0)
            var ptRight = new DOMPoint(bboxElement.getBoundingClientRect().right, 0)
            var vrvSVG = this.interactionOverlay //cq.getVrvSVG(this.containerId) as unknown as SVGGraphicsElement 
            var left = ptLeft.matrixTransform(vrvSVG.getScreenCTM().inverse()).x
            var right = ptRight.matrixTransform(vrvSVG.getScreenCTM().inverse()).x

            //snap only when within boundaries of target Chord
            if (cx > left && cx < right) {
                var snapTarget: Element
                var snapTargetBBox: DOMRect
                var phantomSnapX: number
                var targetwidth: number
                var snapCoord: number
                // if(navigator.userAgent.toLowerCase().includes("firefox")){ // special rules for buggy firefox
                //     if(elementToHighlight.querySelector(".notehead") === null) return
                //     targetwidth = right - left//elementToHighlight.querySelector(".notehead")?.getBoundingClientRect().width
                //     snapTarget = elementToHighlight.classList.contains("chord") ?  elementToHighlight : elementToHighlight.querySelector(".note") || elementToHighlight
                //     console.log("snapTarget", snapTarget)
                //     snapTargetBBox = snapTarget.getBoundingClientRect()
                //     // phantomSnapX = snapTargetBBox.x - window.scrollX - rootBBox.x - root.scrollLeft
                //     snapCoord = snapTargetBBox.x
                // }else{
                snapTarget = bboxElement//elementToHighlight.querySelector(".notehead")|| elementToHighlight
                snapTargetBBox = snapTarget.getBoundingClientRect()
                // phantomSnapX = snapTargetBBox.x + snapTargetBBox.width/2 - window.scrollX - rootBBox.x - root.scrollLeft
                snapCoord = snapTargetBBox.x + snapTargetBBox.width / 2
                //}

                let snappt = new DOMPoint(snapCoord, 0)
                phantomSnapX = snappt.matrixTransform(vrvSVG.getScreenCTM().inverse()).x

                if (elementToHighlight.querySelector(".chord") !== null) {
                    console.log(phantomSnapX)
                }
                phantom.setAttribute("cx", phantomSnapX.toString())
                if (!phantom.classList.contains("onChord")) {
                    phantom.classList.add("onChord")
                    phantom.classList.add("l" + elementToHighlight.closest(".layer").getAttribute("n"))

                    if (!elementToHighlight.classList.contains("chord")) {
                        elementToHighlight.classList.add("highlighted")
                    } else {
                        elementToHighlight.querySelectorAll(".note").forEach((c: Element) => {
                            c.classList.add("highlighted")
                        })
                    }
                }
            } else {
                for (const [key, value] of phantom.classList.entries()) {
                    if (value.indexOf("l") === 0) {
                        phantom.classList.remove(value)
                    }
                }
                phantom.classList.remove("onChord")
                phantom.setAttribute("fill", "black")
                this.container.querySelectorAll(".highlighted").forEach(h => {
                    h.classList.remove("highlighted")
                })
            }

            this.currentElementToHighlight = elementToHighlight
        }

    }).bind(this)

    /**
         * Find Score Element nearest to given Position (e.g. Mouse)
         * @param posx client position
         * @param posy client position
         * @returns 
         */
    findScoreTarget(posx: number, posy: number): Element {
        var nextNote = this.m2s.findScoreTarget(posx, posy)
        if (nextNote != undefined) {
            var el = this.vrvSVG.querySelector("#" + nextNote.id)?.closest(".chord") || this.vrvSVG.querySelector("#" + nextNote.id)
            if (el.classList.contains("notehead")) {
                el = el.parentElement
            }
            return el
        }
        return
    }


    ///// GETTER / SETTER////////////////

    setm2s(m2s: Mouse2SVG) {
        this.m2s = m2s
        return this
    }

    setMusicPlayer(musicPlayer: MusicPlayer) {
        this.musicPlayer = musicPlayer
        return this
    }

    setContainerId(id: string) {
        this.containerId = id
        this.vrvSVG = cq.getVrvSVG(id)
        this.interactionOverlay = cq.getInteractOverlay(id)
        this.container = document.getElementById(id)
        return this
    }


    setAnnotations(annotations: Annotations) {
        this.annotations = annotations
        return this
    }

    setInsertCallback(insertCallback: (newNote: NewNote, replace: Boolean) => Promise<any>) {
        this.insertCallback = insertCallback
        return this
    }

    setDeleteCallback(deleteCallback: (notes: Array<Element>) => Promise<any>) {
        this.deleteCallback = deleteCallback
        return this
    }

    setPhantomCursor(peh: PhantomElementHandler) {
        this.phantomElementHandler = peh

        return this
    }

}

export default ClickModeHandler