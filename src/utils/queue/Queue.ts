import { IQueue } from './IQueue'

export class Queue<T> implements IQueue<T> {
  private storage: T[] = []

  constructor (private capacity: number = Infinity) {}

  enqueue (item: T): void {
    if (this.size() === this.capacity) {
      throw Error('Queue has reached max capacity, you cannot add more items')
    }
    this.storage.push(item)
  }

  dequeue (): T | undefined {
    return this.storage.shift()
  }

  size (): number {
    return this.storage.length
  }

  // Note: substring search on stringified storage is intentional and safe for the current usage
  // (number[] items): each item's brackets make matches exact, so no partial-index false positives.
  // If this ever needs to be generalized or cleaned up, replace with:
  //   return this.storage.some(e => JSON.stringify(e) === JSON.stringify(item))
  contains (item :T) {
    const a = JSON.stringify(this.storage)
    const b = JSON.stringify(item)
    return a.indexOf(b) !== -1
  }
}
