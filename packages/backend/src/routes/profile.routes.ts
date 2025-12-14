import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  userProfileService,
  InsufficientDataError,
  AnalysisError,
} from '../services/user-profile.service';
import { AuthRequest } from '@danci/shared/types';

const router = Router();

const extractUserId = (req: AuthRequest) => req.user?.id;

const handleError = (res: Response, err: unknown) => {
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
    const cognitiveProfile = await userProfileService.getCognitiveProfile(userId);
    res.json({ success: true, data: cognitiveProfile.chronotype });
  } catch (err: unknown) {
    handleError(res, err);
  }
});

router.get('/learning-style', authMiddleware, async (req, res) => {
  const userId = extractUserId(req);
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    const cognitiveProfile = await userProfileService.getCognitiveProfile(userId);
    res.json({ success: true, data: cognitiveProfile.learningStyle });
  } catch (err: unknown) {
    handleError(res, err);
  }
});

// Combined endpoint if the frontend prefers one call.
router.get('/cognitive', authMiddleware, async (req, res) => {
  const userId = extractUserId(req);
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    const cognitiveProfile = await userProfileService.getCognitiveProfile(userId);
    res.json({
      success: true,
      data: cognitiveProfile,
    });
  } catch (err: unknown) {
    handleError(res, err);
  }
});

export default router;
