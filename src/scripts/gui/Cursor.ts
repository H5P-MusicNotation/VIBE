import { NoteBBox } from "../utils/Types";
import { constants as c } from "../constants"
import { Mouse2MEI } from "../utils/Mouse2MEI";

class Cursor{
    private cursorRect: SVGRectElement;
    private cursor: SVGSVGElement
    private posx: number;
    private posy: number;
    private height: number
    private noteBBoxes: Array<NoteBBox>;
    private measureBBox: NoteBBox;
    private interval: NodeJS.Timeout;
    private m2m: Mouse2MEI

    private nextElement: Element
    private maxOpacity: number = 0
    private isBol: Boolean

    constructor(){
        if(document.getElementById("cursor") !== null){
            document.getElementById("cursor").remove()
        }
        // this.cursor = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        // var root = document.getElementById(c._ROOTSVGID_)
        // var rootBBox = root.getBoundingClientRect()
        // var rootWidth = rootBBox.width.toString()
        // var rootHeigth = rootBBox.height.toString()
        // this.cursor.setAttribute("viewBox", ["0", "0", rootWidth, rootHeigth].join(" "))
        //this.cursor = document.getElementById("manipulatorCanvas") as unknown as SVGSVGElement
        this.cursorRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        this.setClickListener();
    }

    flashStart(){
        var cursorOn = true;
        var speed = 500;
        this.cursorRect.style.opacity = this.maxOpacity.toString();
        this.interval = setInterval(() => {
          if(cursorOn) {
            this.cursorRect.style.opacity = "0"
            cursorOn = false;
          }else {
            this.cursorRect.style.opacity = this.maxOpacity.toString();
            cursorOn = true;
          }
        }, speed);
    }

    flashStop(){
        clearInterval(this.interval)
        this.cursorRect.style.opacity = "0";
        this.cursorRect.remove();
    }


    setClickListener(){
        document.getElementById(c._ROOTSVGID_).addEventListener('click', this.clickHandler)
    }

    removeClickListener(){
        document.getElementById(c._ROOTSVGID_).removeEventListener('click', this.clickHandler)
    }

    clickHandler = (function clickHandler(evt: MouseEvent){
        evt.stopPropagation();

        var selectRect = document.querySelector("#keyModeSelectRect")
        if(selectRect !== null){
            selectRect.remove()
            document.querySelectorAll(".marked").forEach(m => {
                m.classList.remove("marked")
            })
        }

        var pt = new DOMPoint(evt.clientX, evt.clientY)
        var rootMatrix = (document.getElementById("rootSVG") as unknown as SVGGraphicsElement).getScreenCTM().inverse()
        var ptX = pt.matrixTransform(rootMatrix).x
        var ptY =  pt.matrixTransform(rootMatrix).y
        var element = this.findScoreTarget(ptX, ptY)
        this.definePosById(element.id)
        
    }).bind(this)

    findScoreTarget(x: number, y: number): Element{
        this.posx = x
        this.posy = y 
        var nbb = this.m2m.findScoreTarget(this.posx, this.posy, true, {left: true, right: false}) // only consider left Elements of click position
        var element = document.getElementById(nbb.id)
        if(element.classList.contains("note") && element.closest(".chord") !== null){
            element = element.closest(".chord")
        }
        this.nextElement = element
        console.log(this.nextElement)
        return element
    }

    /**
     * Define position of Cursor by ID of Elements. Cursor will then be placed right of the Element
     * @param id 
     */
    definePosById(id: string){
        // debugging 
        console.log("NextElement: ", document.getElementById(id))
        document.querySelectorAll("*[fill=green]").forEach(fg => {
            fg.removeAttribute("fill")
        })
        document.getElementById(id).setAttribute("fill", "green")
        //

        this.flashStop()
        this.cursor = document.getElementById("manipulatorCanvas") as unknown as SVGSVGElement
        this.cursor.insertBefore(this.cursorRect, this.cursor.firstChild)
        var element = document.getElementById(id)
        element = element?.classList.contains("layer") ? element.closest(".staff") : element //special rule for layer (== beginning of measure)

        var elementBBox: DOMRect
        var currLayerY: number
        var distToElement: number
        var elementHeight: number 
        if(navigator.userAgent.toLowerCase().indexOf("firefox") > -1){
            distToElement =["note", "rest", "chord", "keySig", "clef", "meterSig"].some(e => {
                return element?.classList.contains(e)
            }) ? 40 : 0
        }else{
            distToElement =["note", "rest", "chord", "keySig", "clef", "meterSig"].some(e => {
                return element?.classList.contains(e)
            }) ? element.getBoundingClientRect().width + 10 : 0 
        }

        var ptLayer: DOMPoint
        var parentMatrix = (this.cursor as unknown as SVGGraphicsElement).getScreenCTM().inverse()
        //determine reference boundingbox for further computation of dimensions
        if(element !== null){
            elementBBox = element.getBoundingClientRect()
            currLayerY = element.classList.contains("staff") ? element.getBoundingClientRect().y : element.closest(".layer")?.getBoundingClientRect().y || 0
            this.nextElement = element
            this.isBol = false
        }else{
            currLayerY = document.querySelector(".layer[n=\"" + (parseInt(id[id.length-1]) + 1).toString() + "\"]").getBoundingClientRect().y
            elementBBox = this.nextElement.getBoundingClientRect()
            distToElement = -distToElement
            this.isBol = true
        }

        ptLayer = new DOMPoint(0, currLayerY)
        currLayerY = ptLayer.matrixTransform(parentMatrix).y

        if(navigator.userAgent.toLowerCase().indexOf("firefox") > -1){
            elementHeight = element.querySelector(".stem")?.getBoundingClientRect().height || element.querySelector("barLine")?.getBoundingClientRect().height || 11
        }else{
            elementHeight = elementBBox.height
        }
        
        //scaled height and width of elemnetBBox 
        var ptLT = new DOMPoint(elementBBox.left, elementBBox.top)
        ptLT = ptLT.matrixTransform(parentMatrix)
        var ptRB = new DOMPoint(elementBBox.right, elementBBox.bottom)
        ptRB = ptRB.matrixTransform(parentMatrix)

        var ptWidth = ptRB.x - ptLT.x
        var ptHeight = ptRB.y - ptLT.y

        var drawChordRect: Boolean
        if(document.getElementById("chordButton").classList.contains("selected")){
            drawChordRect = true
        }else{
            drawChordRect = false
        }

        // set width and height
        this.cursorRect.setAttribute("id", "cursor")
        var ptCursor = new DOMPoint(elementBBox.x, elementBBox.y)
        ptCursor = ptCursor.matrixTransform(parentMatrix)
        if(!drawChordRect || navigator.userAgent.toLowerCase().indexOf("firefox") > -1){ // Firefox only gets the normal text cursor for chord mode :(
            this.posx = ptCursor.x + distToElement
            this.posy = ptCursor.y
            this.height = ptHeight + 4
            this.cursorRect.setAttribute("width", "2px");
            this.cursorRect.setAttribute("height", this.height.toString());
            this.maxOpacity = 1
        }else{ // for chord mode
            var padding = 4
            this.posx = ptCursor.x 
            this.posy = currLayerY
            this.cursorRect.setAttribute("width", (ptWidth + padding).toString());
            this.cursorRect.setAttribute("height", (ptHeight + padding).toString());
            this.maxOpacity = 0.5
        }
        this.cursorRect.setAttribute("x", this.posx.toString());        
        this.cursorRect.setAttribute("y", this.posy.toString())

        //document.querySelector(c._ROOTSVGID_WITH_IDSELECTOR_).insertBefore(this.cursorRect, document.querySelector(c._ROOTSVGID_WITH_IDSELECTOR_).firstChild);
        //document.querySelector(c._ROOTSVGID_WITH_IDSELECTOR_).insertBefore(this.cursor, document.querySelector(c._ROOTSVGID_WITH_IDSELECTOR_).firstChild);
        this.flashStart();
    }

    isBOL(): Boolean{
        return this.isBol
    }


    ///////// GETTER/ SETTER ////////////

    getNextElement(): Element{
        return this.nextElement
    }

    getPos(): {x: number, y: number}{
        return {x: this.posx, y: this.posy}
    }

    setM2M(m2m: Mouse2MEI){
        this.m2m = m2m
    }
}

export default Cursor;