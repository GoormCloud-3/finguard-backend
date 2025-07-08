class MinHeap {
  constructor(arr = []) {
    this.heap = [];
    arr.forEach((val) => this.push(val));
  }

  push(val) {
    this.heap.push(val);
    this._bubbleUp();
  }

  pop() {
    if (this.size() === 0) return null;
    const top = this.heap[0];
    const end = this.heap.pop();
    if (this.size() > 0) {
      this.heap[0] = end;
      this._sinkDown();
    }
    return top;
  }

  peek() {
    return this.heap[0] || null;
  }

  size() {
    return this.heap.length;
  }

  toArray() {
    return [...this.heap];
  }

  _bubbleUp() {
    let i = this.heap.length - 1;
    const val = this.heap[i];
    while (i > 0) {
      let parentIdx = Math.floor((i - 1) / 2);
      if (this.heap[parentIdx] <= val) break;
      this.heap[i] = this.heap[parentIdx];
      i = parentIdx;
    }
    this.heap[i] = val;
  }

  _sinkDown() {
    let i = 0;
    const length = this.heap.length;
    const val = this.heap[i];

    while (true) {
      let leftIdx = 2 * i + 1;
      let rightIdx = 2 * i + 2;
      let swap = null;

      if (leftIdx < length && this.heap[leftIdx] < val) swap = leftIdx;
      if (
        rightIdx < length &&
        this.heap[rightIdx] < (swap === null ? val : this.heap[leftIdx])
      )
        swap = rightIdx;

      if (swap === null) break;
      this.heap[i] = this.heap[swap];
      i = swap;
    }
    this.heap[i] = val;
  }
}

class MaxHeap {
  constructor(arr = []) {
    this.heap = new MinHeap(arr.map((v) => -v));
  }

  push(val) {
    this.heap.push(-val);
  }

  pop() {
    const val = this.heap.pop();
    return val !== null ? -val : null;
  }

  peek() {
    const val = this.heap.peek();
    return val !== null ? -val : null;
  }

  size() {
    return this.heap.size();
  }

  toArray() {
    return this.heap.toArray().map((v) => -v);
  }
}

module.exports = { MinHeap, MaxHeap };
