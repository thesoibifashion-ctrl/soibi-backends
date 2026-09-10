import { Router } from 'express';
import { getBlogPost, listBlogPosts } from '../controllers/blog.controller.js';
const router = Router();
router.get('/', listBlogPosts);
router.get('/:slug', getBlogPost);
export default router;
