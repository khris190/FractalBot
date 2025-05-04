'use strict'

import dayjs from 'dayjs'
import { SonicBoom } from 'sonic-boom'

function getNextDay (start:number) {
  return new Date(start + 24 * 60 * 60 * 1000).setHours(0, 0, 0, 0)
}

function getNextHour (start:number) {
  return new Date(start + 60 * 60 * 1000).setMinutes(0, 0, 0)
}

function getNextCustom (frequency:number) {
  return Date.now() + frequency
}

type freqType = 'daily' | 'hourly' | number
interface Frequency {
  frequency: freqType
  start?: number
  next: number
}
function getNext (frequency:freqType) {
  if (frequency === 'daily') {
    return getNextDay(new Date().setHours(0, 0, 0, 0))
  }
  if (frequency === 'hourly') {
    return getNextHour(new Date().setMinutes(0, 0, 0))
  }
  return getNextCustom(frequency)
}
function getFileName (fileVal : (() => string) | string) {
  if (!fileVal) {
    throw new Error('No file name provided')
  }
  return typeof fileVal === 'function' ? fileVal() : fileVal
}

function parseFrequency (frequency: freqType): Frequency | null {
  const today = new Date()
  if (frequency === 'daily') {
    const start = today.setHours(0, 0, 0, 0)
    return { frequency, start, next: getNextDay(start) }
  }
  if (frequency === 'hourly') {
    const start = today.setMinutes(0, 0, 0)
    return { frequency, start, next: getNextHour(start) }
  }
  if (typeof frequency === 'number') {
    return { frequency, next: getNextCustom(frequency) }
  }
  if (frequency) {
    throw new Error(`${frequency} is neither a supported frequency or a number of milliseconds`)
  }
  return null
}
function buildFileName (fileVal: (() => string) | string, frequency: freqType, extension: string) {
  let format = 'YYYYMMDDHH'
  if (frequency === 'daily') {
    format = 'YYYYMMDD'
  } else if (frequency === 'hourly') {
    format = 'YYYYMMDDHH'
  }
  // return `${getFileName(fileVal)}.${dateformat(new Date(), format)}${extension ?? ''}`
  return `${getFileName(fileVal)}.${dayjs().format(format)}${extension ?? ''}`
}
interface Options {
  file: string
  extension: string
}

type pinoRollOptions = import('sonic-boom').SonicBoomOpts & Options

/**
 * Creates a Pino transport (a Sonic-boom stream) to writing into files.
 * Automatically rolls your files based on a given frequency, size, or both.
 *
 * @param {PinoRollOptions} options - to configure file destionation, and rolling rules.
 * @returns {Promise<SonicBoom>} the Sonic boom steam, usabled as Pino transport.
 */
export default function ({
  file,
  extension,
  ...opts
} : pinoRollOptions): SonicBoom {
  const frequency = 'daily'
  const frequencySpec = parseFrequency(frequency)
  let fileName = buildFileName(file, frequency, extension)

  const destination = new SonicBoom({ ...opts, dest: fileName })

  let rollTimeout : NodeJS.Timeout
  if (frequencySpec) {
    destination.once('close', () => {
      clearTimeout(rollTimeout)
    })
    scheduleRoll(frequencySpec)
  }

  function roll () {
    fileName = buildFileName(file, frequency, extension)
    destination.reopen(fileName)
  }

  function scheduleRoll (frequencySpec: Frequency) {
    clearTimeout(rollTimeout)
    rollTimeout = setTimeout(() => {
      roll()
      frequencySpec.next = getNext(frequency)
      scheduleRoll(frequencySpec)
    }, frequencySpec.next - Date.now())
  }

  return destination
}
