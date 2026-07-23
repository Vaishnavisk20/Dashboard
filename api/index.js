import { handleRequest } from '../src/server/index.js';

export default function handler(req, res) {
  return handleRequest(req, res);
}
