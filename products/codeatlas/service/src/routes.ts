import type { RouteRegistrar } from './server';
import { chatRoutes } from './routes/chat';
import { investigationRoutes } from './routes/investigations';

/** Feature route modules register here. */
export const allRegistrars: RouteRegistrar[] = [chatRoutes(), investigationRoutes()];
