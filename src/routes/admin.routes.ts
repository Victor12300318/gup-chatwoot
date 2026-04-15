import { Router } from 'express';
import { createConnection, deleteConnection, getConnections, getConnection, updateConnection } from '../controllers/admin.controller';

const router = Router();

router.get('/', getConnections);
router.get('/:id', getConnection);
router.post('/', createConnection);
router.put('/:id', updateConnection);
router.delete('/:id', deleteConnection);

export default router;
