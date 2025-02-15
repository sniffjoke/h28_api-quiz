import { SendAnswerUseCase } from './send-answer.use-case';
import { CreateOrConnectUseCase } from './create-or-connect.use-case';
import { CreateQuestionUseCase } from './create-question.use-case';

export const QuizCommandHandlers = [
  SendAnswerUseCase,
  CreateOrConnectUseCase,
  CreateQuestionUseCase
  // DeleteBlogUseCase,
  // UpdatePostWithBlogInParamsUseCase,
  // DeletePostWithBlogInParamsUseCase
];
