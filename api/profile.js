import { handle } from '../lib/http.js';
export default function handler(req, res, trustedIp) { return handle(req, res, 'profile', trustedIp); }
