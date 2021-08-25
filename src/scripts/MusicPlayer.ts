import * as Tone from 'tone';
import { NewNote, NoteTime } from './utils/Types';
import {noteToCross, noteToB} from './utils/mappings'
import MidiPlayer from 'midi-player-js';
import * as Soundfont from 'soundfont-player'
import { constants as c } from './constants'
import ScoreGraph from './datastructures/ScoreGraph';
import { timeThursdays } from 'd3';

const currentlyPlayingFlag = "currentlyPlaying"
const followerRectID = "followerRect"

const AudioContext = window.AudioContext
const synth = new Tone.Synth().toDestination()

class MusicPlayer{
    private player: MidiPlayer.Player;
    private context: AudioContext;
    private midi: string;
    private midiTimes: Map<number, Array<any>>
    private pulse: number;
    private mei: Document;
    private tempo: number

    private timeouts: Array<any>
    private currentNote: Element
    private noteEvent: Event
    private canvasG: any;
    private root: HTMLElement;
    private rootBBox: any;

    private restartTime: number
    private markedNote: Element

    private instruments: Array<Soundfont.Player>
    private durationMap: Map<string, {note: Element, duration: number, tick: number}> // key: tracknumber,byteindex;
    private durationMapByNote: Map<Element, {duration: number, tick: number}>

    private scoreGraph: ScoreGraph

    constructor(){
        this.noteEvent = new Event("currentNote")
        this.restartTime = 0

        this.setPlayListener()
    }

    /**
     * Add Canvas in which all MusicPlayer SVGs are contained
     */
    addCanvas(){
        if(typeof this.canvasG === "undefined"){
            this.canvasG = document.createElementNS(c._SVGNS_, "svg")
            this.canvasG.setAttribute("id", "canvasMusicPlayer")
        }      
        this.root = document.getElementById(c._ROOTSVGID_)
        this.root.insertBefore(this.canvasG, this.root.firstChild)
        this.rootBBox = this.root.getBoundingClientRect()
    }

    /**
     * Initialize Player
     */
    initPlayer(){
        var that = this

        //@ts-ignore
        this.player = new MidiPlayer.Player(function(event) {
            if(event.name === "Set Tempo"){
                that.pulse = (60000/ (event.data * 24))/10000 //duration is in seconds
            }
            if (event.name === 'Note on') {
                var track = event.track
                var time = event.tick * that.pulse * 1000 * 2
                var key = track.toString() + "," + event.byteIndex.toString()
                if(!that.durationMap.has(key)){
                    return
                }
                var duration = that.durationMap.get(key).duration
                that.restartTime = event.tick
                that.highlight(time, duration * 1000 * 2)
                that.drawFollowerRect()

                var instr = that.instruments[track - 2]
                if(typeof instr !== "undefined"){
                    instr.play(event.noteName, that.context.currentTime, {gain:event.velocity/100, duration: duration}); 
                }   
                                   
            } 
        })

        function stringToBuffer(midi: string): ArrayBuffer{
            var binary_string = window.atob(midi);
            var len = binary_string.length;
            var bytes = new Uint8Array(len);
            for (var i = 0; i < len; i++) {
                bytes[i] = binary_string.charCodeAt(i);
            }
            return bytes.buffer;
        }

       
        this.player.loadArrayBuffer(stringToBuffer(this.midi))
        this.mapDurations()
        if(typeof this.instruments === "undefined"){ // instruments only have to be updated, when new instrument (= track) is added
            this.context = new AudioContext()
            this.instruments = new Array(this.player.getEvents().length - 1)
            this.initInstruments()
        }
    } 
    //some change

    /**
     * Stop playing
     */
    stopInstruments(){
        this.player.stop()
        this.instruments.forEach(instr => instr.stop(this.context.currentTime))
        this.player = undefined
        this.stopTimeouts()
        if(this.restartTime === 0){
            if(document.getElementById(followerRectID) !== null){
                document.getElementById(followerRectID).remove()
            }
            Array.from(document.getElementsByClassName(currentlyPlayingFlag)).forEach(element => {
                element.classList.remove(currentlyPlayingFlag) 
            });
        }
        this.initPlayer()
    }

    rewind(){
        if(typeof this.player !== "undefined"){
            this.restartTime = 0
            this.stopInstruments()
        }
    }

    /**
     * Initialize Instrument for 
     */
    initInstruments(){
        this.setSoundfontsRecursive()
    }

    setSoundfontsRecursive(counter = 0){
        var i = counter
        var that = this
        if(i < this.instruments.length){
            Soundfont.instrument(this.context, "acoustic_grand_piano").then((instrument) => {
                that.instruments[i] = instrument
                i += 1
                that.setSoundfontsRecursive(i)
            })
        }
    }

    playMidi(){
        if(this.player.isPlaying()){
            this.stopInstruments()
            
        }else{
            this.player.on("endOfFile", () => {
                this.rewind()
            })
            this.player.division = this.tempo
            this.player.tempo = this.tempo
            this.player.tick = this.restartTime
            this.player.skipToTick(this.restartTime)
            this.player.play() 
        }
    }

    ///// LISTENERS ////
    setListeners(){
        if(typeof this.midiTimes === "undefined"){
            return 
        }

        var it = this.midiTimes.values()
        var result = it.next()
        while(!result.done){
            var arr: Array<any> = result.value
            arr.forEach(note => {
                note.addEventListener("currentNote", this.setCurrentNoteHandler)
                note.addEventListener("click", this.markedHandler)
            })
            result = it.next()
        }
    }

    removeListeners(){
        if(typeof this.midiTimes === "undefined"){
            return 
        }

        var it = this.midiTimes.values()
        var result = it.next()
        while(!result.done){
            var arr: Array<any> = result.value
            arr.forEach(note => {
                note.removeEventListener("currentNote", this.setCurrentNoteHandler)
                note.removeEventListener("click", this.markedHandler)
            })
            result = it.next()
        }
    }

    resetListeners(){
        this.removeListeners()
        this.setListeners()
    }

    /**
     * Separate Listeners to set player options externally
     */
    setPlayListener(){
        document.addEventListener("keydown",this.playHandler)
    }

    removePlayListener(){
        document.removeEventListener("keydown",this.playHandler)
    }

    playHandler = (function playHandler(evt: KeyboardEvent){
        this.playFunction(evt)
    }).bind(this)

    playFunction(evt: KeyboardEvent){

        if(evt.code === "Space"){
            evt.preventDefault()
            if(evt.shiftKey || document.getElementById("followerRect") !== null){
                this.context.resume().then(() => this.playMidi())
            }else if(typeof this.player !== "undefined" ){
                this.stopInstruments()
            }
        }
    }

    setCurrentNoteHandler = (function setCurrentNoteHandler(e: Event){
        this.currentNote = e.target
    }).bind(this)

    /**
     *  Set last clicked element to restartpoint
     */
    markedHandler = (function markedHandler(e: MouseEvent){
        Array.from(document.querySelectorAll(".marked")).forEach(n => {
            n.classList.remove("marked")
        })
        var playingNote = e.target as Element
        playingNote = playingNote.closest(".note") || playingNote.closest(".rest") || playingNote.closest(".mRest")
        playingNote?.classList.add("marked")
        if(playingNote !== null){
            var it = this.durationMap.values()
            var res = it.next()
            while(!res.done){
                if(playingNote.id === res.value.note.id){
                    this.restartTime = res.value.tick
                    break;
                }
                res = it.next()
            }
        }
    }).bind(this)

    /**
     * Map all durations and notes to make them available asynchronically
     */
    mapDurations(){
        this.tempo = 120
        var durationMap = new Map<string, {note: Element, duration: number, tick: number}>() // key: tracknumber,byteindex
        var mapByNote = new Map<Element, {duration: number, tick: number}>()
        var eventTracks = this.player.getEvents()
        eventTracks.forEach(eventArray => {
            //@ts-ignore
            Array.from(eventArray).forEach(event => {
                var e: any = event
                if(e.name === "Set Tempo"){
                    this.pulse = (60000/ (e.data * 24))/10000 //duration is in seconds
                }
                if(e.name === "Note on"){
                    var time = e.tick * this.pulse * 1000 * 2
                    var notes = this.midiTimes.get(time)
                    if(typeof notes === "undefined"){
                        return
                    }
                    notes.forEach(note => {
                        var meiNote = this.mei.getElementById(note.id)
                        var staffNumber = parseInt(meiNote.closest("staff").getAttribute("n")) + 1
                        if(!meiNote.hasAttribute("grace")){
                            var key = e.track.toString() + "," + e.byteIndex.toString()
                            if(!durationMap.has(key) && e.track === staffNumber && e.velocity !== 0){
                                if(!meiNote.hasAttribute("dur")){
                                    meiNote = meiNote.closest("chord")
                                }
                                var baseDur = 4/ parseInt(meiNote.getAttribute("dur")) // 4 = base for tempo
                                if(meiNote.hasAttribute("dots")){
                                    var add = baseDur
                                    for(var i = 0; i < parseInt(meiNote.getAttribute("dots")); i++){
                                        add = add/2
                                        baseDur += add
                                    }
                                }
                                var dur =  baseDur * this.tempo * this.pulse 
                                var valueFound = false
                                var it = durationMap.values()
                                var res = it.next()
                                while(!res.done){
                                    if(res.value.note === note && res.value.duration === dur){
                                        valueFound = true
                                        break;
                                    }
                                    res = it.next()
                                }
                                if(!valueFound){
                                    durationMap.set(key, {note: note, duration: dur, tick: e.tick as number})
                                    mapByNote.set(note, {duration: dur, tick: e.tick as number})
                                }
                            }
                        }
                    })
                    
                }
            }) 
        })
        this.durationMap = durationMap
        this.durationMapByNote = mapByNote
    }

    setAudioContext(): Promise<void>{
        var that = this
        return new Promise<void>((resolve, reject):void => {
            window.onload = function(){
                resolve() 
            }
        })
    }

    setMidi(midi: string){
        this.midi = midi;
    }

    /**
     * Highlight playing Elements
     * @param time Time at which Element is played (in ms)
     * @param duration Duration of Element (in ms)
     */
    highlight(time: number, duration: number){
        time = Math.floor(time)
        var notes: Array<Element> = this.midiTimes.get(time)
        this.timeouts = new Array()
        notes.forEach(n => {
            this.addClass(n, currentlyPlayingFlag).then(() => {
                var to = setTimeout(() => {n.classList.remove(currentlyPlayingFlag)}, duration)
                this.timeouts.push(to)
            })
        })
    }


    /**
     * Adds Class to be highlighted. 
     * Dispatches event for every Note which was started most currently
     */
    addClass = (function addClass(n: Element, className: string){
        return new Promise(resolve => {
            n.classList.add(className)
            n.dispatchEvent(this.noteEvent)
            resolve(true)
        })
    }).bind(this)

    

    /**
     * Draw follower rectangle over all staves for last sounding element
     */
    drawFollowerRect(){

        var rect =  document.getElementById(c._ROOTSVGID_)
        var rectBBox = rect.getBoundingClientRect();

        var followerRect: Element
        if(document.getElementById(followerRectID) !== null){
            followerRect = document.getElementById(followerRectID)
        }else{
            followerRect = document.createElementNS(c._SVGNS_, "rect")
            this.canvasG.appendChild(followerRect)
        }
        var margin = 5
        var currentNoteRect =this.currentNote.getBoundingClientRect()
        var parentMeasureRect = this.currentNote.closest(".measure").getBoundingClientRect()
        var upperBound = parentMeasureRect.top - margin - rectBBox.y
        var lowerBound = parentMeasureRect.bottom + margin - rectBBox.y
        var leftBound = currentNoteRect.left - margin - rectBBox.x 
        var rightBound = currentNoteRect.right + margin - rectBBox.x 

        followerRect.setAttribute("id", followerRectID)
        followerRect.setAttribute("y", upperBound.toString())
        followerRect.setAttribute("x", leftBound.toString())
        followerRect.setAttribute("width", (rightBound - leftBound).toString())
        followerRect.setAttribute("height", (lowerBound - upperBound).toString())
    }


    ///SYNTH////

    generateTone(newNote: NewNote): void{
        if(newNote.rest){
            return
        }
        
        let note = newNote.pname
        let dur = newNote.dur + "n"
        if(typeof newNote.keysig !== "undefined" && newNote.keysig !== "0"){
            let signMap
           if(newNote.keysig.charAt(1) === "s"){
                signMap = noteToCross
            }else if(newNote.keysig.charAt(1) === "f"){
                signMap  = noteToB
            }

            let signCount = parseInt(newNote.keysig.charAt(0))
            let submap = new Map<string, string>()
            let i = 0;
            for(const [key, value] of signMap.entries()){
                if(i < signCount){
                    submap.set(key, value)
                }
                i += 1
            }
            if(submap.has(note)){
                note = submap.get(note)
                note = note.charAt(0).toUpperCase() + note.charAt(1).toUpperCase() + newNote.oct
            }else{
                note = note.toUpperCase() + newNote.oct;
            }
        }else{
            note = note.toUpperCase() + newNote.oct;
        }

        if(!note.includes("undefined") && !dur.includes("undefined")){
            synth.triggerAttackRelease(note, dur);
            Tone.start();
        }
    }


    // UTILS

    setMEI(mei: Document){
        this.mei = mei
        return this
    }

    setNoteTimes(midiTimes: Map<number, Array<any>>){
        this.midiTimes = midiTimes
        return this
    }

    setScoreGraph(scoreGraph: ScoreGraph){
        this.scoreGraph = scoreGraph
        return this
    }

    stopTimeouts(){
        if(typeof this.timeouts !== "undefined"){
            this.timeouts.forEach(to => {
                clearTimeout(to)
            })
        }
    }

    resetInstruments(){
        this.instruments = undefined
    }

    getRestartTime(){
        return this.restartTime
    }

    setRestartTimeBySeconds(time: number){
        return this.restartTime = time
    }

    setRestartTimeByElement(el: Element){
        throw Error("Not yet implemented")
    }

    update(){
        this.resetListeners()
        this.initPlayer()
    }
}

export default MusicPlayer;
