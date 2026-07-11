/**
 * Error thrown when a packet payload size exceeds the physical limit of the transport.
 */
export class PayloadTooLargeError extends Error {
  constructor(actualSize: number, maxSize: number = 200) {
    super(`Payload size of ${actualSize} bytes exceeds the maximum allowed limit of ${maxSize} bytes.`);
    this.name = 'PayloadTooLargeError';
    
    // Set the prototype explicitly to restore prototype chain in ES5/ES6 runtimes
    Object.setPrototypeOf(this, PayloadTooLargeError.prototype);
  }
}
