export class Problem extends Error {
  constructor(status,message,code='REQUEST_ERROR'){super(message);this.status=status;this.code=code;}
}
export function requireValue(condition,message,status=400){if(!condition)throw new Problem(status,message);}
