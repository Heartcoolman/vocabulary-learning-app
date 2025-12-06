import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  getChronotypeProfile,
  getLearningStyleProfile,
  InsufficientDataError,
  AnalysisError,
} from '../services/cognitive-profiling.service';

const router = Router();

const extractUserId = (req: Request) =>
  (req as any).user?.id || (req as any).user?.userId || (req as any).user?._id;

const handleError = (res: Response, err: any) => {
  if (err instanceof InsufficientDataError) {
    res.status(400).json({
      success: false,
      error: `Not enough data to build profile (need ${err.required}, have ${err.actual}).`,
    });
    return;
  }
  if (err instanceof AnalysisError) {
    res.status(500).json({ success: false, error: err.message });
    return;
  }
  res.status(500).json({ success: false, error: 'Unexpected error' });
};

router.get('/chronotype', authMiddleware, async (req, res) => {
  const userId = extractUserId(req);
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    const profile = await getChronotypeProfile(userId);
    res.json({ success: true, data: profile });
  } catch (err: any) {
    handleError(res, err);
  }
});

router.get('/learning-style', authMiddleware, async (req, res) => {
  const userId = extractUserId(req);
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    const profile = await getLearningStyleProfile(userId);
    res.json({ success: true, data: profile });
  } catch (err: any) {
    handleError(res, err);
  }
});

// Combined endpoint if the frontend prefers one call.
router.get('/cognitive', authMiddleware, async (req, res) => {
  const userId = extractUserId(req);
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    const [chronotype, learningStyle] = await Promise.all([
      getChronotypeProfile(userId),
      getLearningStyleProfile(userId),
    ]);
    res.json({
      success: true,
      data: { chronotype, learningStyle },
    });
  } catch (err: any) {
    handleError(res, err);
  }
});

export default router;
