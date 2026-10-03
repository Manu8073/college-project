import { Router } from 'express';
import { createEvent, listEvents } from '../controllers/eventsController.js';

const router = Router();

// GET  /api/events
router.get('/',  listEvents);

// POST /api/events
router.post('/', createEvent);

export default router;
