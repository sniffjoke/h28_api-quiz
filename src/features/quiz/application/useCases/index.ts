import { SendAnswerUseCase } from './send-answer.use-case';
import { CreateOrConnectUseCase } from './create-or-connect.use-case';
import { CreateQuestionUseCase } from './create-question.use-case';
import { DeleteQuestionUseCase } from './delete-question.use-case';
import { UpdateQuestionUseCase } from './update-question.use-case';
import { UpdatePublishStatusCommand } from './update-publish-status.use-case';

export const QuizCommandHandlers = [
  SendAnswerUseCase,
  CreateOrConnectUseCase,
  CreateQuestionUseCase,
  DeleteQuestionUseCase,
  UpdateQuestionUseCase,
  UpdatePublishStatusCommand
];
