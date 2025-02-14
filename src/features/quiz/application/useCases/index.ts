import { SendAnswerUseCase } from './send-answer.use-case';
import { CreateOrConnectUseCase } from './create-or-connect.use-case';

export const QuizCommandHandlers = [
  SendAnswerUseCase,
  CreateOrConnectUseCase
  // DeleteBlogUseCase,
  // UpdatePostWithBlogInParamsUseCase,
  // DeletePostWithBlogInParamsUseCase
];
