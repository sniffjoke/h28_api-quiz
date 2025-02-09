import { ForbiddenException, Injectable } from '@nestjs/common';
import { QuizRepositoryTO } from '../infrastructure/quiz.repository.to';
import { UsersService } from '../../users/application/users.service';
import { CreateAnswerInputModel } from '../api/models/input/create-answer.input.model';
import { CreateQuestionInputModel } from '../api/models/input/create-question.input.model';
import { UpdatePublishStatusInputModel } from '../api/models/input/update-publish-status.input.model';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class QuizService {

  constructor(
    private readonly quizRepository: QuizRepositoryTO,
    private readonly usersService: UsersService,
  ) {

  }

  async getCurrentUnfGame(bearerHeader: string) {
    const user = await this.usersService.getUserByAuthToken(bearerHeader);
    return await this.quizRepository.findGameByUser(user);
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async loggerId() {
    let lastAnswerTime
    const currentActiveGames = await this.quizRepository.findAllActiveGames()
    for (const game of currentActiveGames) {
      if (game.firstPlayerProgress.answers.length === 5) {
        lastAnswerTime = game.secondPlayerProgress.answers.length ? Date.parse(game.secondPlayerProgress.answers[game.secondPlayerProgress.answers.length - 1].addedAt) : 0;
        // if (game.secondPlayerProgress.answers.length < 5) {}
        if (game.secondPlayerProgress.answers.length < 5  && Date.parse(new Date(Date.now()).toString()) - 10000 > Date.parse(game.firstPlayerProgress.answers[game.firstPlayerProgress.answers.length - 1].addedAt)) {
          await this.quizRepository.finishGame(game);
        }
      }
    }
  }

  async findGameById(id: number, bearerHeader: string) {
    const user = await this.usersService.getUserByAuthToken(bearerHeader);
    return await this.quizRepository.findGameById(id, user);
  }

  async createOrConnect(bearerHeader: string): Promise<number> {
    const user = await this.usersService.getUserByAuthToken(bearerHeader);
    const findUserGames = await this.quizRepository.findLastActiveGameForUser(user)
    for (const item of findUserGames) {
      if (item.firstPlayerProgress.userId === user.id || item?.secondPlayerProgress?.userId === user.id) {
        throw new ForbiddenException('You cant connect because have an active game');
      }
    }
    return await this.quizRepository.findOrCreateConnection(user);
  }

  //------------------------------------------------------------------------------------------//
  //--------------------------------------STATISTIC-------------------------------------------//
  //------------------------------------------------------------------------------------------//

  async findOneStat(bearerHeader: string) {
    const user = await this.usersService.getUserByAuthToken(bearerHeader);
    return await this.quizRepository.findStatistic(user);
  }

  //------------------------------------------------------------------------------------------//
  //-----------------------------------------ANSWERS------------------------------------------//
  //------------------------------------------------------------------------------------------//

  async sendAnswer(answerData: CreateAnswerInputModel, bearerHeader: string) {
    const user = await this.usersService.getUserByAuthToken(bearerHeader);
    return await this.quizRepository.sendAnswer(answerData.answer, user);
  }

  //------------------------------------------------------------------------------------------//
  //----------------------------------------QUESTIONS-----------------------------------------//
  //------------------------------------------------------------------------------------------//

  async createNewQuestion(questionData: CreateQuestionInputModel): Promise<string> {
    const newQuestionId = await this.quizRepository.createQuestion(questionData);
    return newQuestionId;
  }

  async updateQuestionById(id: string, questionData: Partial<CreateQuestionInputModel>) {
    return await this.quizRepository.updateQuestionById(id, questionData);
  }

  async deleteQuestion(id: string) {
    return await this.quizRepository.deleteQuestion(id);
  }

  async updateQuestionPublish(id: string, updateData: UpdatePublishStatusInputModel) {
    return await this.quizRepository.updateQuestionPublishStatus(id, updateData);
  }

}
