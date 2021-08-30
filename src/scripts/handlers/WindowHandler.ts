import MusicPlayer from "../MusicPlayer";
import { Mouse2MEI } from "../utils/Mouse2MEI";
import Handler from "./Handler";
import ScoreManipulatorHandler from "./ScoreManipulatorHandler";
import { constants as c } from "../constants"


class WindowHandler implements Handler{
    m2m?: Mouse2MEI;
    musicPlayer?: MusicPlayer;
    currentMEI?: string | Document;
    //smHandler: ScoreManipulatorHandler

    setListeners(){
        window.addEventListener("scroll", this.update)
        window.addEventListener("resize", this.update)
        window.addEventListener("deviceorientation", this.update)
        document.getElementById("sidebarContainer").addEventListener("transitionend", this.update)

        document.getElementById(c._ROOTSVGID_).parentElement.addEventListener("scroll", this.update)
        document.getElementById(c._ROOTSVGID_).parentElement.addEventListener("resize", this.update)
        document.getElementById(c._ROOTSVGID_).parentElement.addEventListener("deviceorientation", this.update)

        document.querySelectorAll("*").forEach(el => {
            el.addEventListener("fullscreenchange", this.update)
        })

        return this
    }

    removeListeners() {
        window.removeEventListener("scroll", this.update)
        window.removeEventListener("resize", this.update)
        window.removeEventListener("deviceorientation", this.update)
        document.getElementById("sidebarContainer").removeEventListener("transitionend", this.update)

        document.getElementById(c._ROOTSVGID_).parentElement.removeEventListener("scroll", this.update)
        document.getElementById(c._ROOTSVGID_).parentElement.removeEventListener("resize", this.update)
        document.getElementById(c._ROOTSVGID_).parentElement.removeEventListener("deviceorientation", this.update)

        document.querySelectorAll("*").forEach(el => {
            el.removeEventListener("fullscreenchange", this.update)
        })
        return this
    }

    update = (function update(e: Event){
        var that = this
        window.clearTimeout(isScrolling)

        var isScrolling = setTimeout(function(){
            that.m2m.update()
        }, 100)  
    }).bind(this)

    scoreChangedHandler = (function scoreChangedHandler(e: Event){
        console.log(e)
    }).bind(this)

    resetListeners(){
        this
            .removeListeners()
            .setListeners()

        return this
    }

    setM2M(m2m: Mouse2MEI){
        this.m2m = m2m
        return this
    }

    // setSMHandler(smHandler: ScoreManipulatorHandler){
    //     this.smHandler = smHandler
    //     return this
    // }
    
}

export default WindowHandler