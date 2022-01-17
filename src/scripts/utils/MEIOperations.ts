import * as meiConverter from './MEIConverter'
import { uuidv4 } from './random'
import { constants as c} from '../constants'
import { NewChord, NewNote, NewClef } from './Types'
import { keysigToNotes, nextStepUp, nextStepDown, clefToLine, keyIdToSig } from './mappings'
import MeiTemplate from '../assets/mei_template'
import { xml } from 'd3'
import ScoreGraph from '../datastructures/ScoreGraph'
import MeasureMatrix from '../datastructures/MeasureMatrix'


const countableNoteUnitSelector: string =  
":scope > note:not([grace])," +
":scope > chord," +
":scope > beam > chord," +
":scope > beam > note:not([grace])," +
":scope > rest"

////// DELETE //////
/**
 * Remove Elements from MEI. 
 * Some Elements (such as accid...) could are not represeented as elements in the current MEI.
 * These have to be found in the parent element which have these as an attribute.
 * @param scoreElements Array of Elements which are marked in the SVG Representation (notes, chords, slur, tie, accid etc..)
 * @param currentMEI 
 * @returns 
 */
export function removeFromMEI(scoreElements: Array<Element>, currentMEI: Document): Promise<Document> {
  return new Promise<Document>((resolve): void => {

    scoreElements.forEach(se => {
      if(currentMEI.getElementById(se.id) !== null){ // this only applies for <note> and <rest>
        //do not remove completely, replace with rest
        //currentMEI.getElementById(note.id).remove()
        if(["note", "chord"].some(s => se.classList.contains(s))){
          replaceWithRest(se, currentMEI)
        }else{
          currentMEI.getElementById(se.id).remove() // possibility to remove rests entirely
        }
      }else{
        //may be some of the following: accid
        var closestNote = currentMEI.getElementById(se.closest(".note").id)
        if(closestNote !== null){
          console.log("removing ", se)
          var attrName = se.classList.item(0).toLowerCase()
          closestNote.removeAttribute(attrName)
          if(attrName === "accid"){
            closestNote.removeAttribute("accid.ges")
          }
        }
      }
    })
    //removeEmptyElements(currentMEI)
    // For now: No Shifts (22.07.2021)
    // if($(".measure").length > 1){
    //   checkDeleteShifts(currentMEI);
    // }
    cleanUp(currentMEI)
    //fillWithRests(currentMEI)
  
    // Warum ist das ein Problem?
    currentMEI = meiConverter.restoreXmlIdTags(currentMEI)
    resolve(currentMEI)
  })
}

function checkDeleteShifts(xmlDoc: Document): void {
  var meterRatio = getMeterRatioGlobal(xmlDoc)
  var shifters: Array<Element> = new Array;
  var elements = xmlDoc.getElementsByTagName("layer");
  Array.from(elements).forEach(layer => {
    var actualMeterFill = getAbsoluteRatio(layer);
    var layerLevel = layer.getAttribute("n");
    var staffLevel = layer.closest("staff").getAttribute("n")
    var nextSibling = layer.closest("measure").nextElementSibling
    if(actualMeterFill<meterRatio && nextSibling !== null){
      let hasStaff = nextSibling.querySelector("staff[n$='"+ staffLevel +"'") !== null ? true : false
      let hasLayer = nextSibling.querySelector("layer[n$='"+ layerLevel +"'") !== null ? true : false
      if(hasStaff && hasLayer){
        nextSibling = nextSibling.querySelector("staff[n$='"+ staffLevel +"'").querySelector("layer[n$='"+ layerLevel +"'")
        Array.from(nextSibling.querySelectorAll(countableNoteUnitSelector)).forEach(node => {
          if(actualMeterFill<meterRatio){
            shifters.push(node)
          }
          actualMeterFill += 1/parseInt(node.getAttribute("dur"))
        })
      }
    }
    if(shifters.length > 0){
      doShiftLeft(shifters, meterRatio)
      shifters.length = 0;
      checkDeleteShifts(xmlDoc)
    }
  })
}

function getMeterRatioGlobal(xmlDoc: Document): number{
  var staffDef: Element = xmlDoc.getElementsByTagName("staffDef").item(0)
  var meterRatio: number = null
  //Do I know the meter?
  if(staffDef.getAttribute(c._METERCOUNT_) !== null && staffDef.getAttribute(c._METERUNIT_) !== null){
    meterRatio = parseInt(staffDef.getAttribute(c._METERCOUNT_)) / parseInt(staffDef.getAttribute(c._METERUNIT_))
  }else{
    meterRatio = extrapolateMeter(xmlDoc)
  }

  return meterRatio
}

//////// INSERT ////////// 
  /**
   * Insert given sound event into MEI
   * @param newSound NewNote or NewChord to be inserted 
   * @param currentMEI MEI as Document
   * @param replace Switching to replaceMode (default: False)
   * @param scoreGraph 
   * @returns mei
   */
export function addToMEI(newSound: NewNote | NewChord, currentMEI: Document, replace: Boolean = false, scoreGraph: ScoreGraph = null): Document{//Promise<Document> {
  //return new Promise<Document>((resolve): void => {
    var currMeiClone = currentMEI.cloneNode(true)
    var newElem: Element
    if(newSound.hasOwnProperty("pname")){
      var newNote = newSound as NewNote
      if(newNote.rest){
        newElem = currentMEI.createElement("rest")
      }else{
        newElem = currentMEI.createElement("note");
        newElem.setAttribute("pname", newNote.pname);
        newElem.setAttribute("oct", newNote.oct);
        if(typeof newNote.accid !== "undefined"){
          newElem.setAttribute("accid.ges", newNote.accid)
        }
      }
      newElem.setAttribute("dur", newNote.dur);

      if(typeof newNote.dots !== "undefined"){
        newElem.setAttribute("dots", newNote.dots)
      }
      if(typeof newNote.id !== "undefined" && newNote.id !== null){
        newElem.setAttribute("id", newNote.id)
      }

      //Do sthm with chords
      if(typeof newNote.chordElement !== "undefined" && !newNote.rest){
        var chord: Element
        var meiChordEl = currentMEI.getElementById(newNote.chordElement.id)
        if(newNote.chordElement.classList.contains("chord")){
          chord = meiChordEl
          chord.appendChild(newElem)
        }else{
          chord = document.createElement("chord")
          chord.setAttribute("id", uuidv4())
          chord.setAttribute("dur", meiChordEl.getAttribute("dur"));
            if(meiChordEl.getAttribute("dots") !== null){
              chord.setAttribute("dots", meiChordEl.getAttribute("dots"))
            }
          chord.appendChild(newElem)
          meiChordEl.parentElement.insertBefore(chord, meiChordEl)
          chord.appendChild(meiChordEl)
        }

        chord.childNodes.forEach((n: Element) => {
          n.removeAttribute("dur")
          n.removeAttribute("dots")
        });
        
      }else if(newNote.nearestNoteId !== null){
        var sibling: HTMLElement = currentMEI.getElementById(newNote.nearestNoteId);
        
        //special rule for first element in layer
        if(sibling.tagName === "layer"){
          if(scoreGraph !== null){
            sibling = currentMEI.getElementById(scoreGraph.getCurrentNode().getRight().getId())?.parentElement
          }
          var firstChild = sibling.firstChild as Element
          sibling.insertBefore(newElem, firstChild)
          if(replace){
            changeDuration(currentMEI, "reduce", [firstChild], newElem)
          }

        }else{
          var parentLayer = sibling.closest("layer")
          var trueParent = sibling.parentElement
          var isTrueSibling = parentLayer == trueParent
          var trueSibling: HTMLElement = sibling;
          if(!isTrueSibling){
              var currParent: HTMLElement = trueParent;
              while(!isTrueSibling){
                isTrueSibling = (trueSibling.tagName === "note" && trueSibling.closest("chord") === null) || trueSibling.closest("chord") === trueSibling //parentLayer == currParent.parentElement 
                if(!isTrueSibling){
                  trueSibling = currParent;
                  currParent = currParent?.parentElement;
                }
              }
          }

          //if(replace && trueSibling.nextSibling !== null){
          if(replace){
            if(newNote.relPosX === "left"){
              let ms = Array.from(trueSibling.parentElement.querySelectorAll("note:not(chord note), chord, rest, mRest")) as Element[]
              var measureSiblings = ms.filter((v, i) => i >= ms.indexOf(trueSibling))
              trueSibling.parentElement.insertBefore(newElem, trueSibling)
              changeDuration(currentMEI, "reduce", measureSiblings, newElem)
              //changeDuration(currentMEI, "reduce", [(trueSibling as Element)], newElem)
            }else{
              if(trueSibling.nextSibling !== null){
                let ms = Array.from(trueSibling.parentElement.querySelectorAll("note:not(chord note), chord, rest, mRest")) as Element[]
                var measureSiblings = ms.filter((v, i) => i >= ms.indexOf(trueSibling.nextSibling as Element))
                trueSibling.parentElement.insertBefore(newElem, trueSibling.nextSibling)
                changeDuration(currentMEI, "reduce", measureSiblings, newElem)
                //changeDuration(currentMEI, "reduce", [(trueSibling.nextSibling as Element)], newElem)
              }else{
                trueSibling.parentElement.append(newElem)
              }
            }
          }else{          
            if(newNote.relPosX === "left"){
              trueSibling.parentElement.insertBefore(newElem, trueSibling)
            }else{
              trueSibling.parentElement.insertBefore(newElem, trueSibling.nextSibling)
            }
          }
        }
      
        // For now: No Shifts (22.07.2021)
        // if($(".measure").length > 1){
        //   checkInsertShifts(currentMEI);
        // }

      }else{
        currentMEI.getElementById(newNote.staffId).querySelector("layer").appendChild(newElem)
      }
    }else{ // is newChord
      //TODO
      var newChord = newSound as NewChord
      newElem = convertToElement(newChord, currentMEI)
      if(newChord.relPosX === "left"){
        currentMEI.getElementById(newChord.nearestNoteId).parentElement.insertBefore(newElem, currentMEI.getElementById(newChord.nearestNoteId))
      }else{
        currentMEI.getElementById(newChord.nearestNoteId).parentElement.insertBefore(newElem, currentMEI.getElementById(newChord.nearestNoteId).nextSibling)
      }
    }

    //check if measure is too long, return if too long
    var overfillMeasure = false
    if(!overfillMeasure){
      var newMeasureRatio = getAbsoluteRatio(newElem.closest("layer"))
      if(newMeasureRatio > getMeterRatioGlobal(currentMEI)){
        currentMEI = currMeiClone as Document
      }
    }

    cleanUp(currentMEI)
    // Warum ist das ein Problem?
    currentMEI = meiConverter.restoreXmlIdTags(currentMEI)
    return currentMEI
    //resolve(currentMEI)
  //})
}


  /**
   * Check if notes have to be shifted after insertion
   * @param xmlDoc 
   */
function checkInsertShifts(xmlDoc: Document) {
  var staffDef: Element = xmlDoc.getElementsByTagName("staffDef").item(0)
  var meterRatio: number = parseInt(staffDef.getAttribute(c._METERCOUNT_)) / parseInt(staffDef.getAttribute(c._METERUNIT_))
  if(staffDef.getAttribute(c._METERCOUNT_) !== null && staffDef.getAttribute(c._METERUNIT_) !== null){
    meterRatio = parseInt(staffDef.getAttribute(c._METERCOUNT_)) / parseInt(staffDef.getAttribute(c._METERUNIT_))
  }else{
    meterRatio = extrapolateMeter(xmlDoc)
  }
  var shifters: Array<Element> = new Array;
  var elements = xmlDoc.getElementsByTagName("layer");
  Array.from(elements).forEach(layer => {
    var i = 0;
    var layerChildern = layer.querySelectorAll(countableNoteUnitSelector)
    Array.from(layerChildern).forEach(node => {
      i += getAbsoluteRatio(node)//1/parseInt(node.getAttribute("dur"))
      if(i>meterRatio){
        shifters.push(node)
      }
    })
    if(shifters.length > 0){
      doShiftRight(shifters, meterRatio, layer)
      shifters.length = 0;
      checkInsertShifts(xmlDoc)
    }
  })
}

/**
 * Shift all Elements to the right (according to measure borders)
 * @param arr Array of Elements to be shifted
 * @param meterRatio 
 * @param currentLayer 
 */
function doShiftRight(arr: Array<Element>, meterRatio: number, currentLayer: Element) {
  arr.forEach((element, elementIdx) => {
    var parentMeasure = element.closest("measure");
    var parentMeasureSibling: Element = null;
    parentMeasureSibling = parentMeasure.nextElementSibling
    if(parentMeasureSibling === null){
      parentMeasureSibling = parentMeasure.parentElement.appendChild(createEmptyCopy(parentMeasure))
    }
    var layerLevel = element.closest("layer").getAttribute("n");
    var staffLevel = element.closest("staff").getAttribute("n")
    var targetStaff = parentMeasureSibling.querySelector("staff[n$='"+ staffLevel +"'")
    var targetLayer: Element
    if(targetStaff.querySelector("layer[n$='"+ layerLevel +"'") !== null){
      targetLayer = targetStaff.querySelector("layer[n$='"+ layerLevel +"'")
    }else{
      targetLayer = document.createElement("layer")
      targetLayer.setAttribute("id", "layer-" + uuidv4())
      targetLayer.setAttribute("n", layerLevel)
      targetStaff.appendChild(targetLayer)
    }
    var absLayerRatio: number = getAbsoluteRatio(currentLayer);
    var elementRatio = getAbsoluteRatio(element)

    var chunkDurRight = absLayerRatio - meterRatio
    var chunkDurLeft = elementRatio - chunkDurRight
    if(chunkDurRight > elementRatio){
      chunkDurRight = elementRatio
      chunkDurLeft = 0
    }
    
    //check if note must be split
    if((absLayerRatio + elementRatio)  > meterRatio && chunkDurRight*chunkDurLeft !== 0){
      //check for dots
      if(Number.isInteger(1/chunkDurLeft) && Number.isInteger(1/chunkDurRight)){
        element.removeAttribute("dots")
        var splitRightElement = element.cloneNode(true) as Element;
        splitRightElement.setAttribute("id", uuidv4())
        splitRightElement.setAttribute("dur", (Math.abs(1/chunkDurRight)).toString())
        var beforeElement = elementIdx === 0 ? targetLayer.firstChild : targetLayer.children.item(elementIdx)
        targetLayer.insertBefore(splitRightElement, beforeElement)
        //change already existing element
        element.setAttribute("dur", (Math.abs(1/chunkDurLeft)).toString())
      }else{
        var dottedElements = splitDottedNote(element, chunkDurLeft, chunkDurRight)
        dottedElements.left.forEach(lel => currentLayer.appendChild(lel))
        var beforeElement = elementIdx === 0 ? targetLayer.firstChild : targetLayer.children.item(elementIdx)
        dottedElements.right.forEach(rel => {
          rel.setAttribute("id", uuidv4())
          if(rel.tagName === "chord"){
            rel.querySelectorAll("note").forEach(rl => {
              rl.setAttribute("id", uuidv4())
            })
          }
          targetLayer.insertBefore(rel, beforeElement)
        })
        element.remove()
      }
    }else{
      var beforeElement = elementIdx === 0 ? targetLayer.firstChild : targetLayer.children.item(elementIdx)
      targetLayer.insertBefore(element, beforeElement)
    }
  })
}

function createEmptyCopy(element: Element): Element{
  let copy = element.cloneNode(true) as Element
  let childrenToDelete = Array.from(copy.querySelectorAll("layer > *, measure > slur"))
  childrenToDelete.forEach(child => {
      child.parentNode.removeChild(child)
  })
  //set new ids for everything
  copy.setAttribute("id", uuidv4())
  copy.setAttribute("n", (parseInt(element.getAttribute("n")) + 1).toString())
  let allElements = copy.querySelectorAll("*")
  allElements.forEach(e => e.setAttribute("id", uuidv4()))

  return copy
}



///// GENERAL OPERATIONS /////

function getAbsoluteRatio(el: Element): number{
  var i = 0;
  var arr: Array<Element>;

  if(el.tagName !== "layer"){ //if single Element is given, eg. chord, note
    arr = [el]
    //if element is tied to another
    // el.closest("measure")?.querySelectorAll("tie").forEach(t => {
    //   if(t.getAttribute("startid").includes(el.id)){
    //     if(el.closest("layer").querySelector(t.getAttribute("endid")) !== null){
    //       arr.push(el.closest("mei").querySelector(t.getAttribute("endid")))
    //     }
    //   }
    // })
  }else{
    arr = Array.from(el.querySelectorAll(countableNoteUnitSelector))
  }

  arr.forEach(node => {
    i += 1/parseInt(node.getAttribute("dur"))
    let baseDur: number = parseInt(node.getAttribute("dur"));
    if(node.getAttribute("dots") !== null){
      let dots = parseInt(node.getAttribute("dots"))
      i += dots == 0 ? 0: (dots * 2 - 1) / (baseDur * 2 * dots);
    }
  })
  return i;
}

function ratioToDur(ratio: number): Array<number>{
  var dur: number
  var dots: number = 0

  //1. next smallest ratio of basedur
  var basedur = 1
  while(basedur > ratio){
    basedur = basedur/2
  }
  dur = 1/basedur
  ratio -= basedur

  if(ratio > 0){
    if(ratio > dur/2){
      dots = 2
    }else{
      dots = 1
    }
  }

  return [dur, dots]
}

/**
 * Shift Elements to left (according to measure borders)
 * @param arr Array of Elements to shift
 * @param meterRatio meterRatio of the piece
 */
function doShiftLeft(arr: Array<Element>, meterRatio: number){
  arr.forEach(element => {
    var parentMeasure = element.closest("measure")
    var parentMeasureSibling = parentMeasure.previousElementSibling;
    var layerLevel = element.closest("layer").getAttribute("n");
    var targetLayer = parentMeasureSibling.querySelector("layer[n$='"+ layerLevel +"'") // should be <layer>
    var absLayerRatio: number = getAbsoluteRatio(targetLayer);
    var elementRatio = getAbsoluteRatio(element)
    //check if note must be split
    if((absLayerRatio + elementRatio)  > meterRatio){
      var chunkDurLeft = meterRatio-absLayerRatio
      var chunkDurRight = elementRatio-chunkDurLeft

      //check for dots
      if(Number.isInteger(1/chunkDurLeft) && Number.isInteger(1/chunkDurRight)){
        element.removeAttribute("dots")
        var splitLeftElement = element.cloneNode(true) as Element;
        splitLeftElement.setAttribute("id", uuidv4())
        splitLeftElement.setAttribute("dur", (Math.abs(1/chunkDurLeft)).toString())
        targetLayer.appendChild(splitLeftElement)
        //change already existing element
        element.setAttribute("dur", (Math.abs(1/chunkDurRight)).toString())
      }else{
        var elements = splitDottedNote(element, chunkDurLeft, chunkDurRight)
        elements.left.forEach(lel => {
          lel.setAttribute("id", uuidv4())
          if(lel.tagName === "chord"){
            lel.querySelectorAll("note").forEach(ll => {
              ll.setAttribute("id", uuidv4())
            })
          }
          targetLayer.appendChild(lel)
        })
        elements.right.forEach(rel => element.parentElement.insertBefore(rel, element))
        element.remove()
      }
        
    }else{
      targetLayer.appendChild(element)
      //is current Layer empty and should be deleted? if split occured this should not be the case
      var parentLayer = parentMeasure.querySelector("layer[n$='"+ layerLevel +"'") // should always be <layer>
      // if(parentLayer.childNodes.length === 0){
      //    parentMeasure.remove();
      // }
    }
  })
}

/**
 * Operations to split dotted notes
 * @param note reference note elements
 * @param chunkLeftDur calculated ratio left
 * @param chunkRightDur calculated ratio right
 * @returns collection of right ans left elements
 */
function splitDottedNote(note: Element, chunkLeftDur: number, chunkRightDur: number): {left: Array<Element>, right: Array<Element>}{

  let gcdLeft = gcd(chunkLeftDur)
  let gcdRight = gcd(chunkRightDur)

  let countLeftSubNotes = findDotsRecursive(chunkLeftDur, gcdLeft) //return z.B.: [8, 16]
  let countRightSubNotes = findDotsRecursive(chunkRightDur, gcdRight) //return z.B. [2, 8, 16]

  let newLeftElement = createElementsFromSubNotes(note, countLeftSubNotes)
  let newRightElement = createElementsFromSubNotes(note, countRightSubNotes)

  return {left: newLeftElement, right: newRightElement}
}

/**
 * Create actual XML Elements from sequence of dotted notes
 * @param note 
 * @param subNoteDurs 
 * @returns 
 */
function createElementsFromSubNotes(note: Element, subNoteDurs: Array<number>): Array<Element>{
  let newElements = new Array<Element>()
  //find sliceBoundaries in array
  let arraySliceIdx = new Array<number>();
  for(var i=0; i<subNoteDurs.length; i++ ){
    if(i>0){
      if(subNoteDurs[i] !== subNoteDurs[i-1]*2){
        arraySliceIdx.push(i)
      }
    }
  }

  //find actual slices 
  let durSlices = new Array<Array<number>>()
  for(var i=0; i<arraySliceIdx.length+1; i++ ){
    if(i === 0){
      durSlices.push(subNoteDurs.slice(0, arraySliceIdx[i]))
    }else if(i === arraySliceIdx.length){
      durSlices.push(subNoteDurs.slice(arraySliceIdx[i-1]))
    }else{
      durSlices.push(subNoteDurs.slice(arraySliceIdx[i-1], arraySliceIdx[i]))
    }
  }

  //create notes
  let createArr = durSlices.length > 0 ? durSlices : [subNoteDurs]
  createArr.forEach(durs => {
    let newElement = note.cloneNode(true) as Element
    newElement.removeAttribute("dots") //eventual dots could be in original note value
    newElement.setAttribute("dur", Math.abs(durs[0]).toString())
    let dots = 0;
    durs.forEach((dur, i) => {
      if(i>0){dots += 1}
    })
    if(dots > 0){newElement.setAttribute("dots", dots.toString())}
    newElements.push(newElement)
  })

  return newElements
}

/**
 * Compute greatest integer divisor
 * @param chunkDur Duration of given Chunk
 * @returns 
 */
function gcd(chunkDur: number): number{
  var largestModulo = null;
  var baseValue = 1;
  var mod = 0
  while(largestModulo === null){
    mod = chunkDur % baseValue
    if(mod === 0){
      largestModulo = baseValue
    }
    baseValue = baseValue/2
  }
  return largestModulo;
}

/**
 * Splits duration of given chunk into possible dotted sequences
 * @param chunk 
 * @param smallestUnit = greatest integer divisor
 * @returns 
 */
function findDotsRecursive(chunk: number, smallestUnit: number): Array<number>{
  var arr = new Array<number>();
  var sliceChunk = chunk/smallestUnit;
  if(Math.floor(sliceChunk) > 1){
    arr = arr.concat(findDotsRecursive(chunk, smallestUnit*2))
  }else if(Math.floor(sliceChunk) < 1){
    arr = arr.concat(findDotsRecursive(chunk, smallestUnit/2))
  }else if(!Number.isInteger(sliceChunk)){
    arr.push(1/1/smallestUnit)
    arr = arr.concat(findDotsRecursive(chunk-smallestUnit, smallestUnit))
  }else{
    arr.push(1/1/smallestUnit)
  }
  return arr //.sort((a,b) => a-b)
}

/**
 * Extrapolates meter, if is not given in scoreDef. Iterates through each staff to get the mostly found ratio
 * @param xmlDoc 
 * @returns meter ratio
 */
export function extrapolateMeter(xmlDoc: Document): number {
  var ratioMap = new Map<number, number>();

  var xmlCopy = xmlDoc.cloneNode(true) as Document;
  var layers = Array.from(xmlCopy.querySelectorAll("layer"))
  var mostlyUsedRatio = 0;
  layers.forEach(layer => {
    
    if(layer.childElementCount === 0){
      return
    }

    //strip all unnecessary elements: garce notes, beams 
    //which do not contribute to count of measure duration
    var beams = Array.from(layer.querySelectorAll("beam"))
    beams.forEach(beam => {
      Array.from(beam.children).forEach(c => { //copy notes/ chords outside of beam first, before removing
        beam.parentElement.append(c)
      })
      xmlCopy.getElementById(beam.id).remove();
    })

    var graceNotes = Array.from(layer.querySelectorAll("[grace]"))
    graceNotes.forEach(g => {
      xmlCopy.getElementById(g.id).remove()
    })
    ///////////////
    
    var childElements = Array.from(layer.children);
    var ratio = 0;
    childElements.forEach(element => {
      ratio += getAbsoluteRatio(element)
    });

    if(!ratioMap.has(ratio)){
      ratioMap.set(ratio, 1)
    }else{
      ratioMap.set(ratio, ratioMap.get(ratio) + 1)
    }
    
    var prevItCount = 0;
    for(const [key, value] of ratioMap.entries()){
      if(value > prevItCount){
        prevItCount = value
        mostlyUsedRatio = key
      }
    }
    
  })
  return mostlyUsedRatio;
}

/**
 * Adjust all accids according to key signature
 * e.g. after changing global Key
 * @param xmlDoc 
 * @returns 
 */
export function adjustAccids(xmlDoc: Document): Document{

  var measureMatrix = new MeasureMatrix()
  measureMatrix.populateFromMEI(xmlDoc)
  console.log(measureMatrix)

  xmlDoc.querySelectorAll("note").forEach(note => {
    let staffN = note.closest("staff").getAttribute("n")
    let measureN = note.closest("measure").getAttribute("n")
    let sig = measureMatrix.get(measureN, staffN).keysig
    let keySymbol = sig.charAt(1)
    let signedNotes = keysigToNotes.get(sig)


    var accid = note.getAttribute("accid")
    var accidGes = note.getAttribute("accid.ges")
    var pname = note.getAttribute("pname")


    if(signedNotes.some(sn => sn === pname)){
      if(accid === keySymbol){
        note.setAttribute("accid.ges", accid)
        note.removeAttribute("accid")
      }
      if(accid === null && accidGes === null){
        note.setAttribute("accid", "n")
      }
    }else if(accid === "n"){
      note.removeAttribute("accid")
      note.removeAttribute("accidGes")
    }else if(accidGes !== null){
      note.removeAttribute("accidGes")
      note.setAttribute("accid", accidGes)
    }
    hideAccid(note)
  })

  return xmlDoc
}

/**
 * Hides Accid, if measure already has accid in notes before
 * @param note given note from MEI
 */
function hideAccid(note: Element){
  var root = note.closest("mei")
  var accid = note.getAttribute("accid")
  var noteid = note.getAttribute("id")
  if(root !== null){ // && document.getElementById(noteid).classList.contains("marked")){
    var pname = note.getAttribute("pname")
    var currentLayer = note.closest("layer")
    var layerNotes = currentLayer.querySelectorAll("note")
    var hasAccidBefore = false
    for(var i = 0; i < layerNotes.length; i++){
      var currentNote = layerNotes[i]
      if(currentNote === note){
        break
      }
      var currPname = currentNote.getAttribute("pname")
      var currAccid = currentNote.getAttribute("accid")
      var currAccidGes = currentNote.getAttribute("accid.ges")
      if(pname === currPname && (currAccid === accid || currAccidGes === accid) && accid !== null){
        hasAccidBefore = true
      }
      
      if(pname === currPname && (currAccid !== accid || currAccidGes !== accid) && accid !== null){
        hasAccidBefore = false
      }
      
      if(pname === currPname && accid === null && hasAccidBefore){
        hasAccidBefore = false
        note.setAttribute("accid", "n")
      }
    }
    if(hasAccidBefore){
      note.removeAttribute("accid")
      note.setAttribute("accid.ges", accid)
    }
  }
}

/**
 * Transpose marked notes according to direcion (up or down)
 * @param xmlDoc 
 * @param direction 
 * @returns 
 */
export function transposeByStep(xmlDoc: Document, direction: string): Document{
  document.querySelectorAll(".note.marked").forEach(nm => {
    var noteMEI = xmlDoc.getElementById(nm.id)
    var pname = noteMEI.getAttribute("pname")
    var oct = parseInt(noteMEI.getAttribute("oct"))
    var accid = noteMEI.getAttribute("accid") || noteMEI.getAttribute("accid.ges")
    if(accid === null || typeof accid == "undefined" || accid === "n"){
      accid = ""
    }
    
    var nextNote: string
    if(direction === "up"){
      nextNote = nextStepUp.get(pname + accid)
    }else if(direction === "down"){
      nextNote = nextStepDown.get(pname + accid)
    }

    noteMEI.setAttribute("pname", nextNote.charAt(0))
    if(nextNote.charAt(1) !== ""){
      noteMEI.setAttribute("accid", nextNote.charAt(1))
    }else{
      noteMEI.removeAttribute("accid")
      noteMEI.removeAttribute("accid.ges")
    }

    //Change Octave
    if( ["c", "bs"].includes(pname + accid) && nextNote === "b"){
      noteMEI.setAttribute("oct", (oct-1).toString())
    }
    if(["b", "cf"].includes(pname + accid) && nextNote === "c"){
      noteMEI.setAttribute("oct", (oct+1).toString())
    }
  })

  return adjustAccids(xmlDoc)
}

/**
 * Change Meter according to #timeUnit and #timeCount in side bar option. 
 * @param xmlDoc 
 * @returns changed mei; null, if input has no valid values
 */
export function changeMeter(xmlDoc: Document): Document {
    var timeCount = document.getElementById("timeCount")
    var timeUnit = document.getElementById("timeUnit")

    //@ts-ignore
    var timeCountValue = timeCount.value //getAttribute("value")
    //@ts-ignore
    var timeUnitValue = timeUnit.value //getAttribute("value")

    if(timeCountValue !== null && timeUnitValue !== null){
      timeCountValue = timeCountValue.trim()
      timeUnitValue = timeUnitValue.trim()

      if(!isNaN(parseInt(timeCountValue)) &&  !isNaN(parseInt(timeUnitValue))) {
        var oldMeterRatio = getMeterRatioGlobal(xmlDoc)
        xmlDoc.querySelectorAll("staffDef").forEach(sd => {
          sd.setAttribute("meter.count", timeCountValue)
          sd.setAttribute("meter.unit", timeUnitValue)
        })

        // adjust noteposition 
        var newMeterRatio = getMeterRatioGlobal(xmlDoc)
        if(oldMeterRatio > newMeterRatio){
          checkInsertShifts(xmlDoc)
        }else if(oldMeterRatio < newMeterRatio){
          checkDeleteShifts(xmlDoc)
        }
        if(oldMeterRatio !== newMeterRatio){
          return xmlDoc
        }
      }
    }

    return xmlDoc //null  
}

/**
 * disable features if necesseray (only supposed to be used for debugging)
 * @param features Array of TagNames and AttributeNames which have to be disabled (deleted)
 * @param xmlDoc mei
 * @returns 
 */
export function disableFeatures(features: Array<string>, xmlDoc: Document){
  console.log("Features disabled:", features)
  features.forEach(f => {
    
    var elements = Array.from(xmlDoc.getElementsByTagName(f))
    elements.forEach(e => {
      let parent = e.parentElement
      e.remove()
      if(parent.childElementCount === 0){
        parent.remove()
      }
    })

    elements = Array.from(xmlDoc.querySelectorAll("*[" + f +"]"))
    elements.forEach(e => {
      let parent = e.parentElement
      e.remove()
      if(parent.childElementCount === 0){
        parent.remove()
      }
    })

  })

  return xmlDoc
}

/**
 * Fill Empty Space with rest
 * @param xmlDoc 
 */
function fillWithRests(xmlDoc: Document){
  var staffDef = xmlDoc.getElementsByTagName("staffDef").item(0)
  var meterCount: string
  var meterUnit: string
  var meterRatio: number
  if(staffDef.getAttribute(c._METERCOUNT_) !== null && staffDef.getAttribute(c._METERUNIT_) !== null){
    meterCount = staffDef.getAttribute(c._METERCOUNT_)
    meterUnit = staffDef.getAttribute(c._METERUNIT_)
    meterRatio= parseInt(meterCount) / parseInt(meterUnit)
  }else{
    var meterRatio = getMeterRatioGlobal(xmlDoc)
    meterCount = (meterRatio*4).toString()
    meterUnit = "4"
  }

  xmlDoc.querySelectorAll("measure").forEach(m =>{
    m.querySelectorAll("staff").forEach(s => {
      s.querySelectorAll("layer").forEach((l, idx) => {
        //mRest for empty Layer
        if(l.childElementCount === 0){
          if(idx === 0){
            var restEl = document.createElementNS(c._MEINS_, "mRest")
            l.appendChild(restEl)
          }else{ // remove 1+ empty layer
            l.remove()
          }
        }else{
          var actualMeterFill = getAbsoluteRatio(l)
          var ratioDiff = Math.abs(actualMeterFill-meterRatio)
          var smallestValue = gcd(ratioDiff)
          //var restDurs = findDotsRecursive(ratioDiff, gcd(ratioDiff))
          if(Number.isInteger(ratioDiff/smallestValue) && ratioDiff > 0){
            var leftRatio = ratioDiff
            var durArr = new Array<number>()
            while(!Number.isInteger(1/leftRatio)){
              var leftRatio = ratioDiff-smallestValue
              durArr.push(1/smallestValue)
            }
            durArr.push(1/leftRatio)
            durArr = durArr.reverse()
            durArr.forEach(dur => {
              var newRest = xmlDoc.createElementNS(c._MEINS_, "rest")
              newRest.setAttribute("dur", dur.toString())
              l.appendChild(newRest)
            })
          }

          //console.log(document.getElementById(l.id), ratioDiff, gcd(ratioDiff), durArr)
        }
      })
    })
    
  })
}

/**
 * Replace given id with rest
 * @param element element from svg 
 * @param xmlDoc 
 */

function replaceWithRest(element: Element, xmlDoc: Document){
  var elmei: Element = xmlDoc.getElementById(element.id)
  //var closestChord: Element = xmlDoc.getElementById(element.id).closest("chord")
  //if(closestChord !== null){elmei = closestChord}
  var dur = elmei.getAttribute("dur")
  var dots = elmei.getAttribute("dots")
  var newRest = xmlDoc.createElementNS(c._MEINS_, "rest")
  newRest.setAttribute("dur", dur)
  if(dots !== null){newRest.setAttribute("dots", dots)}
  elmei.parentElement.insertBefore(newRest, elmei)
  elmei.remove()
}

/**
 * Change duration of the following sound events. Elements to change duration are determined by the class "marked". 
 * @param xmlDoc Current MEI as Document
 * @param mode "prolong" or "reduce"
 * @param additionalElements Elements to be considered to be changed.
 * @param refElement Reference Element by which all determined elements (.marked and additionElements) will be changed (e.g. replacing duration during a note insert)
 * @param marked Consider marked elements
 * @returns 
 */
export function changeDuration(xmlDoc: Document, mode: string, additionalElements: Array<Element> = new Array(), refElement: Element = null){
  var changedFlag = "changed"
  var multiplier: number
  switch(mode){
    case "reduce":
      multiplier = 2
      break;
    case "prolong":
      multiplier = 1/2
      break;
    default:
      console.error(mode, "No such operation")
      return
  }
  var refRatio = getAbsoluteRatio(xmlDoc.getElementById(refElement.id))
  var elements: Array<Element> = new Array();
  elements = Array.from(document.querySelectorAll(".note.marked")).map(nm => {
    if(!(additionalElements.some(ae => {ae.id === nm.id})) && nm.id !== refElement.id){
      return xmlDoc.getElementById(nm.id)
    }
  })
  elements = elements[0] == undefined ? additionalElements : elements.concat(additionalElements)

  for(var i = 0; i < elements.length; i++){
    var elmei = xmlDoc.getElementById(elements[i].id) as Element
    var elmeiRatio = getAbsoluteRatio(elmei)
    var chord = elmei.closest("chord")

    //Dur is attribute of chord and all notes will be changed accordingly
    if(chord !== null){
      if(chord.classList.contains(changedFlag)){
        return
      }else{
        elmei = chord
        elmei.classList.add(changedFlag)
      }
    }
    var dur = parseInt(elmei.getAttribute("dur"))
    if(dur > 0){
      dur = dur*multiplier

      if(mode === "reduce"){ 
        var globalRatio = getMeterRatioGlobal(xmlDoc)
        var layerRatio = getAbsoluteRatio(elmei.closest("layer"))
        if(refElement == null){ // in this mode, also click replacements are handled
          elmei.setAttribute("dur", dur.toString())
          if(layerRatio < globalRatio){
            var newRest = xmlDoc.createElementNS(c._MEINS_, "rest")
            if(globalRatio - layerRatio < (1/dur)){
              dur = 1/(globalRatio - layerRatio)
            }
            newRest.setAttribute("dur", dur.toString())
            elmei.parentElement.insertBefore(newRest, elmei.nextElementSibling)
          }
        }else if(layerRatio !== globalRatio){
          if(refRatio === elmeiRatio){
            elmei.remove()
            break;
          }else if(refRatio < elmeiRatio){
            elmeiRatio -= refRatio
            refRatio += elmeiRatio
            var elmeiDurDots = ratioToDur(elmeiRatio)
            elmei.setAttribute("dur", elmeiDurDots[0].toString())
            elmei.setAttribute("dots", elmeiDurDots[1].toString())
            break;
          }else if(refRatio > elmeiRatio){
            var tie = elmei.closest("measure").querySelector("tie[startid='#" + elmei.id + "']")
            if(tie !== null){
              tie.remove()
            }
            refRatio = elmeiRatio
            elmei.remove()
          }
        }
      }else if(mode === "prolong"){ // overwrite next siblings in layer
        elmei.setAttribute("dur", dur.toString())
        var remainDur = 1/(dur*2)
        while(remainDur > 0){

          var hasNextSibling = elmei?.nextElementSibling != undefined || elmei.closest("beam")?.nextElementSibling != undefined
          if(hasNextSibling){ // no siblings, if end of layer or last element in beam
            var sibling = elmei.nextElementSibling
            if(sibling !== null){
              sibling = elmei.nextElementSibling.tagName === "beam" ? elmei.nextElementSibling.firstElementChild : elmei.nextElementSibling
            }else{
              sibling = elmei.closest("beam") !== null ? elmei.closest("beam").nextElementSibling : sibling
            }
            var nextDur = 1/parseInt(sibling.getAttribute("dur"))
            remainDur = remainDur - nextDur
            if(remainDur < 0){
              sibling.setAttribute("dur", (1/Math.abs(remainDur)).toString())
            }else{
              sibling.remove()
            }
          }else{
            remainDur = 0
          }
        }
      }
    }
  }
  //clean up after changing durations
  xmlDoc.querySelectorAll(".changed").forEach(c => c.classList.remove(changedFlag))
  cleanUp(xmlDoc)
}


/**
 * Clean up mei after changing values
 * @param xmlDoc 
 */
export function cleanUp(xmlDoc: Document){
  deleteDefSequences(xmlDoc)
  reorganizeBeams(xmlDoc)
  removeEmptyElements(xmlDoc)
  //fillWithRests(xmlDoc)
  adjustRests(xmlDoc)
}

function deleteDefSequences(xmlDoc: Document){
  var staffCount = xmlDoc.querySelectorAll("staffDef").length
  for(var i = 0; i < staffCount; i++){
    var n = (i+1).toString()
    var lastElement = null
    var lastShape = null
    var lastLine = null
    xmlDoc.querySelectorAll("staffDef[n=\"" + n +"\"] clef, staff[n=\"" + n +"\"] clef").forEach(clefElement => {
      var shape = clefElement.getAttribute("shape")
      var line = clefElement.getAttribute("line")
      if(lastElement != null){
        lastShape = lastElement.getAttribute("shape")
        lastLine = lastElement.getAttribute("line")
        if(lastShape === shape && lastLine === line){
          clefElement.remove()
        }else{
          lastElement = clefElement
        }
      }else{
        lastElement = clefElement
      }
    })

    lastElement = null
    var lastSig = null
    xmlDoc.querySelectorAll("staffDef[n=\"" + n +"\"] keySig, staff[n=\"" + n +"\"] keySig").forEach(sigElement => {
      var sig = sigElement.getAttribute("sig")
      if(lastElement != null){
        lastSig = lastElement.getAttribute("sig")
        if(lastSig === sig){
          sigElement.remove()
        }else{
          lastElement = sigElement
        }
      }else{
        lastElement = sigElement
      }
    })
  }

}

function reorganizeBeams(xmlDoc: Document){
  // if beams have elements, which shouldn be there
  xmlDoc.querySelectorAll("beam").forEach(b => {
    var beamNotes = Array.from(b.children)
    if(!beamNotes.every(c => parseInt(c.getAttribute("dur")) >= 8) && beamNotes.length > 0){
      beamNotes.forEach(n => {
        if(parseInt(n.getAttribute("dur")) >= 8){
          if(n.previousElementSibling !== null){
            if(n.previousElementSibling.tagName === "beam"){ // check for previous beams to merge with
              n.previousElementSibling.appendChild(n)
            }
          }else{// else make new beam
            var newBeam = xmlDoc.createElementNS(c._MEINS_, "beam")
            newBeam.setAttribute("id", uuidv4())
            n.parentElement.insertBefore(newBeam, n)
            newBeam.append(n)
          }
        }
      })
      //set all inner elements outseide of old beam
      b.outerHTML = b.innerHTML
    }
  })
}

/**
 * After shifting and removing notes, some elements could be empty
 * @param xmlDoc 
 */
 function removeEmptyElements(xmlDoc: Document) {

  Array.from(xmlDoc.querySelectorAll("beam")).forEach(b => {
    if(b.childElementCount === 0){
      xmlDoc.getElementById(b.id).remove()
    }
    if(b.childElementCount === 1){
      //b.parentElement.insertBefore(b, b.firstChild)
      //b.remove()
      b.outerHTML = b.innerHTML
    }
    var bArr = Array.from(b.children)
    if(bArr.every(c => c.tagName === "rest") && bArr.length > 0){
      // Array.from(b.children).forEach(c => {
      //   b.parentElement.insertBefore(c, b)
      // })
      // b.remove()
      b.outerHTML = b.innerHTML
    }
  })

  Array.from(xmlDoc.querySelectorAll("chord")).forEach(c => {
    if(c.childElementCount === 0){xmlDoc.getElementById(c.id).remove()}
  })

  // Array.from(xmlDoc.querySelectorAll("measure")).forEach(m => {
  //   if(m.querySelectorAll("note, chord").length === 0){
  //     xmlDoc.getElementById(m.id).remove()
  //   }
  // })
}

/**
 * Apply some additional rules for rests, Elements where added
 * @param xmlDoc 
 */
 function adjustRests(xmlDoc: Document){
  //layers can just have mRest as only child
  xmlDoc.querySelectorAll("layer").forEach(l =>{
    Array.from(l.children).forEach(cn => {
      if(cn.tagName === "mRest" && l.childElementCount > 1){
        cn.remove()
      }
    })
  })
}

/**
 * Remove tie from all layers if length of layer exceeds global Ratio
 * @param xmlDoc 
 */
function removeTiesFromDoc(xmlDoc: Document){
  var globalRatio = getMeterRatioGlobal(xmlDoc)
  xmlDoc.querySelectorAll("layer").forEach(l => {
    var layerRatio = getAbsoluteRatio(l)
    if(layerRatio > globalRatio){
      var m = l.closest("measure")
      m.querySelectorAll("tie").forEach(t => {
        l.querySelector(t.getAttribute("endid"))?.remove()
        t.remove()
      })
    }
  })
}

export function addMeasure(xmlDoc: Document){
  var lastMeasure = Array.from(xmlDoc.querySelectorAll("measure")).reverse()[0]
  var staffCounts: number[] = Array.from(lastMeasure.querySelectorAll("staff")).map(s => {return parseInt(s.getAttribute("n"))})
  var staffCount = Math.max.apply(Math, staffCounts)
  var layerCounts: number[] = Array.from(lastMeasure.querySelectorAll("layer")).map(s => {return parseInt(s.getAttribute("n"))})
  var layerCount = Math.max.apply(Math, layerCounts)
  var newMeasure: Element = new MeiTemplate().createMeasure(1, staffCount, layerCount) as Element
  newMeasure.setAttribute("id", uuidv4())
  lastMeasure.parentElement.append(newMeasure)
  var i = 1
  xmlDoc.querySelectorAll("measure").forEach(m => {
    m.setAttribute("n", i.toString())
    i++
  })
  cleanUp(xmlDoc)
}

export function removeMeasure(xmlDoc: Document){
  var measures = Array.from(xmlDoc.querySelectorAll("measure")).reverse()
  if(measures.length > 1){
    measures[0].remove()
}else{
  measures[0].querySelectorAll("layer").forEach(l => {
    l.innerHTML = ""
    l.appendChild(xmlDoc.createElement("mRest"))
  })
}
  cleanUp(xmlDoc)
}

export function addStaff(xmlDoc:Document, referenceStaff: Element, relPos: string){
  var staffNum = referenceStaff.getAttribute("n")
  var refn: string
  var refElement: Element
  xmlDoc.querySelectorAll("staff[n=\"" + staffNum +"\"]").forEach(s =>{
    var newStaff = new MeiTemplate().createStaff(1, 1) as Element
    switch(relPos){
      case "above":
        refElement = s
        break;
      case "below":
        refElement = s.nextElementSibling || s
        break;
      default:
        console.error(relPos, " was never an option")
    }
    if(relPos === "below" && refElement === s){ // => new staff at the end
      s.parentElement.append(newStaff)
    }else{
      s.parentElement.insertBefore(newStaff, refElement)
    }

    refn = refElement?.getAttribute("n") || staffNum // s.getAttribute("n")
  })

  //new StaffDef
  var refStaffDef = xmlDoc.querySelector("staffDef[n=\""+refn+"\"]")
  var refCopy = refStaffDef.cloneNode(true) as Document
  refCopy.querySelectorAll("*[id]").forEach(i => {
    i.removeAttribute("id")
  })
  refStaffDef.parentElement.insertBefore(refCopy, refStaffDef)


  xmlDoc.querySelectorAll("measure").forEach(m => {
    var i = 1
    m.querySelectorAll("staff").forEach(s => {
      s.setAttribute("n", i.toString())
      i++
    }) 
  })
  var i = 1
  xmlDoc.querySelectorAll("staffDef").forEach(sd => {
    sd.setAttribute("n", i.toString())
    i++
  })
  cleanUp(xmlDoc)
}

export function removeStaff(xmlDoc:Document, referenceStaff: Element, relPos:string){
  var staff = xmlDoc.getElementById(referenceStaff.id)
  var staffNum = staff.getAttribute("n")
  var refn: string
  xmlDoc.querySelectorAll("staff[n=\"" + staffNum +"\"]").forEach(s =>{
    switch(relPos){
      case "above":
        refn = s.previousElementSibling.getAttribute("n")
        s.previousElementSibling.remove()
        break;
      case "below":
        refn = s.nextElementSibling.getAttribute("n")
        s.nextElementSibling.remove()
        break;
      default:
        console.error(relPos, " was never an option")
    }
  })

  xmlDoc.querySelector("staffDef[n=\""+refn+"\"]").remove()

  xmlDoc.querySelectorAll("measure").forEach(m => {
    var i = 1
    m.querySelectorAll("staff").forEach(s => {
      s.setAttribute("n", i.toString())
      i++
    })
  })
  var i = 1
  xmlDoc.querySelectorAll("staffDef").forEach(sd => {
    sd.setAttribute("n", i.toString())
    i++
  })
  cleanUp(xmlDoc)
}

/**
 * Paste copied ids. First position to which the Elements are copied is the Element according to the refId (= RefElement).
 * If multiple staffs are copied, overhanging staffs will be pasted to the staffs below the staff of the RefElement, if definedstaffs exist. 
 * Else these copiedId will be not pasted.
 * @param ids 
 * @param refId 
 */
export function paste(ids: Array<string>, refId: string, xmlDoc: Document){
    //ordered by staff
    var meiElements = new Array<Array<Element>>()
    ids.forEach(id => {
      var el = xmlDoc.getElementById(id)
      if(["CHORD", "NOTE"].includes(el?.tagName.toUpperCase())){
        if(!(el.tagName.toUpperCase() === "NOTE" && el.closest("chord") !== null)){
          var staff = el.closest("staff")
          var num = parseInt(staff.getAttribute("n")) - 1
          if(meiElements[num] == undefined){
            meiElements[num] = new Array()
          }
          var cel = el.cloneNode(true) as Element
          cel.setAttribute("id", uuidv4())
          meiElements[num].push(cel)
        }
      }
    })

    var refElement = xmlDoc.getElementById(refId) as Element
    refElement = refElement.closest("chord") || refElement
    var refStaff = refElement.closest("staff")
    var refLayer = refElement.closest("layer")
    var refMeasure = refElement.closest("measure")
    var currentMeasure: Element

    meiElements.forEach((staff,staffIdx) => {
      currentMeasure = refElement.closest("measure")
      let anyNew
      staff.forEach((element,elementIdx) => {
        if(element.tagName.toUpperCase() === "NOTE"){
          var newNote = convertToNewNote(element)
          newNote.nearestNoteId = refElement.id
          newNote.relPosX =  "right"
          anyNew = newNote
        }else if(element.tagName.toUpperCase() === "CHORD"){
          var newChord = convertToNewChord(element)
          newChord.nearestNoteId = refElement.id
          newChord.relPosX =  "right"
          anyNew = newChord
        }

        addToMEI(anyNew, xmlDoc) 
        refElement = element
      })
    })
}

/**
 * Replace clef in main/ first score definition
 * @param targetid 
 * @param newClef 
 * @param currentMEI 
 * @returns 
 */
export function replaceClefinScoreDef(target: Element, newClef: string, currentMEI: Document): Document{
  var staffN = document.getElementById(target.id).closest(".staff").getAttribute("n")
  var staffDefClef = currentMEI.querySelector("staffDef[n=\"" + staffN + "\"] > clef")
  staffDefClef.setAttribute("shape", newClef.charAt(0))
  staffDefClef.setAttribute("line", clefToLine.get(newClef.charAt(0)))
  cleanUp(currentMEI)
  currentMEI = meiConverter.restoreXmlIdTags(currentMEI)
  return currentMEI
}

/**
 * Layer to which a new clef object has to be inserted
 * @param targetid Usually a barline before which new clef should stand
 * @param newClef Name of new Clef to be inserted
 */
export function insertClef(target: Element, newClef: string, currentMEI: Document): Document{
  var targetStaffId = target.closest(".measure").querySelector(".staff[n=\"" + target.getAttribute("n") + "\"]")?.id || target.closest(".staff")?.id
  var targetLayerId = currentMEI.getElementById(targetStaffId).querySelector("layer").id
  currentMEI.getElementById(targetLayerId).querySelectorAll("clef").forEach(c => c.remove())

  var clefElement = currentMEI.createElement("clef")
  clefElement.setAttribute("id", uuidv4())
  clefElement.setAttribute("shape", newClef.charAt(0))
  clefElement.setAttribute("line", clefToLine.get(newClef.charAt(0)))

  currentMEI.getElementById(targetLayerId).append(clefElement)
  cleanUp(currentMEI)
  currentMEI = meiConverter.restoreXmlIdTags(currentMEI)

  return currentMEI
}

export function replaceKeyInScoreDef(target: Element, newSig: string, currentMEI: Document): Document {
  console.log("REPLACE KEY IN SCOREDEF")
  var staffN = document.getElementById(target.id).closest(".staff").getAttribute("n")
  var staffDefSig = currentMEI.querySelector("staffDef[n=\"" + staffN + "\"] > keySig")
  if(staffDefSig !== null){
    staffDefSig.setAttribute("sig", keyIdToSig.get(newSig))
  }else{
    var newSigElement = new MeiTemplate().createKeySig("major", keyIdToSig.get(newSig))
    currentMEI.querySelector("staffDef[n=\"" + staffN + "\"]")?.append(newSigElement)
  }
  adjustAccids(currentMEI)
  cleanUp(currentMEI)
  currentMEI = meiConverter.restoreXmlIdTags(currentMEI)
  return currentMEI
}

export function insertKey(target: Element, newSig: string, currentMEI: Document): Document {
  console.log("INSERT KEY")
  var targetStaff = target.closest(".measure").querySelector(".staff[n=\"" + target.getAttribute("n") + "\"]") || target.closest(".staff")
  var staffN = targetStaff.getAttribute("n")
  var parentMeasure = currentMEI.getElementById(targetStaff.id).closest("measure")
  var pmn = parseInt(parentMeasure.getAttribute("n")) + 1
  var targetLayerId = parentMeasure.parentElement.querySelector("measure[n=\"" + pmn.toString() + "\"] > staff[n=\"" + staffN + "\"] > layer")?.id
  currentMEI.getElementById(targetLayerId).querySelectorAll("keySig")?.forEach(c => c.remove())
  
  var newSigElement = new MeiTemplate().createKeySig("major", keyIdToSig.get(newSig))
  currentMEI.getElementById(targetLayerId).insertBefore(newSigElement, currentMEI.getElementById(targetLayerId).firstElementChild)
  adjustAccids(currentMEI)
  cleanUp(currentMEI)
  currentMEI = meiConverter.restoreXmlIdTags(currentMEI)

  return currentMEI
}

/**
 * Gets timestamp of element. Computes it, if no such attribute is present for the element
 * @param id 
 * @param currentMEI 
 * @returns 
 */
export function getElementTimestampById(id: string, currentMEI: Document): number{
  var element = currentMEI.getElementById(id)
  var timestamp = element.getAttribute("tstamp")
  if(timestamp === null){
    var parentLayer = element.closest("layer")
    var count = 0
    var units = parentLayer.querySelectorAll(countableNoteUnitSelector)
    for(var i=0; i < units.length; i++){
      if(units[i].getAttribute("dur") !== null){
        if(units[i].id === id){
          var fraction = 4
          if(currentMEI.querySelector("meterSig") !== null){
            fraction = parseInt(currentMEI.querySelector("meterSig").getAttribute("unit"))
          }
          timestamp = (count * fraction + 1).toString() // add 1 to accomodate for shift ration sum
          break
        }
        count += getAbsoluteRatio(units[i])
      }
    }
    
  }
  return parseFloat(timestamp)
}







//PRIVATE

function convertToNewNote(element: Element): NewNote{

  var newNote: NewNote = {
    id: element.id,
    pname: element.getAttribute("pname"),
    dur: element.getAttribute("dur"),
    dots: element.getAttribute("dots"),
    oct: element.getAttribute("oct"),
    accid: element.getAttribute("accid.ges") || element.getAttribute("accid"),
    rest: element.classList.contains("rest") ? true : false
  }
  return newNote
}

function convertToElement(n: NewNote | NewChord, xmlDoc: Document): Element{
  var nn
  var newElement: Element
  if(n.hasOwnProperty("pname")){
    nn = n as NewNote
    newElement = xmlDoc.createElement("note")
    newElement.setAttribute("pname", nn.pname)
    newElement.setAttribute("oct", nn.oct)
    newElement.setAttribute("accid", nn.accid)
  }else{
    nn = n as NewChord
    newElement = xmlDoc.createElement("chord")
    nn.noteElements.forEach(ne => {
      newElement.append(convertToElement(ne, xmlDoc))
    });
  }
  newElement.setAttribute("id", uuidv4())
  newElement.setAttribute("dur", nn.dur)
  newElement.setAttribute("dots", nn.dots)

  return newElement
}

function convertToNewChord(element: Element): NewChord{

  var newNotes = Array.from(element.querySelectorAll("note")).map(n => {
    return convertToNewNote(n)
  })

  var newChord: NewChord = {
    id: uuidv4(),
    dur: element.getAttribute("dur"),
    dots: element.getAttribute("dots"),
    noteElements: newNotes
  }

  return newChord
}

