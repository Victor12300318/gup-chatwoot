import { Router } from 'express';
import { createConnection, deleteConnection, getConnections, getConnection, updateConnection } from '../controllers/admin.controller';
import { requireAdminAuth } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { CreateConnectionSchema, UpdateConnectionSchema } from '../schemas/connection.schema';

const router = Router();

router.use(requireAdminAuth);

router.get('/', getConnections);
router.get('/:id', getConnection);
router.post('/', validate(CreateConnectionSchema), createConnection);
router.put('/:id', validate(UpdateConnectionSchema), updateConnection);
router.delete('/:id', deleteConnection);

export default router;
