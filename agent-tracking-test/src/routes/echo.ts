import { Router, Request, Response } from 'express';

const router = Router();

router.post('/echo', (req: Request, res: Response) => {
  res.json(req.body);
});

export default router;
