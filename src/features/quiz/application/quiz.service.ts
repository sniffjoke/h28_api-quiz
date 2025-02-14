import { ForbiddenException, Injectable } from '@nestjs/common';
import { QuizRepositoryTO } from '../infrastructure/quiz.repository.to';
import { UsersService } from '../../users/application/users.service';
import { CreateAnswerInputModel } from '../api/models/input/create-answer.input.model';
import { CreateQuestionInputModel } from '../api/models/input/create-question.input.model';
import { UpdatePublishStatusInputModel } from '../api/models/input/update-publish-status.input.model';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GamePairEntity } from '../domain/game-pair.entity';
import { PlayerProgressEntity } from '../domain/player-progress.entity';
import { AnswerStatuses, GameStatuses } from '../api/models/input/create-pairs-status.input.model';
import { AnswerEntity } from '../domain/answer.entity';

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
  async checkFinishTime() {
    let lastAnswerTime;
    const currentActiveGames = await this.quizRepository.findAllActiveGames()
    for (let game of currentActiveGames) {
      if (game.firstPlayerProgress.answers.length === 5) {
        lastAnswerTime = game.secondPlayerProgress.answers.length ? Date.parse(game.secondPlayerProgress.answers[game.secondPlayerProgress.answers.length - 1].addedAt) : 0;
        if (game.secondPlayerProgress.answers.length < 5  && Date.parse(new Date(Date.now()).toISOString().slice(0, 19).replace('T', ' ')) - 10000 > lastAnswerTime) {
          game = this.calculateScore(game)
          await this.quizRepository.finishGame(game);
        }
      }
      if (game.secondPlayerProgress.answers.length === 5) {
        lastAnswerTime = game.firstPlayerProgress.answers.length
          ? Date.parse(game.firstPlayerProgress.answers[game.firstPlayerProgress.answers.length - 1].addedAt)
          : Date.parse(game.secondPlayerProgress.answers[game.secondPlayerProgress.answers.length - 1].addedAt);
        if (game.firstPlayerProgress.answers.length < 5  && Date.parse(new Date(Date.now()).toISOString().slice(0, 19).replace('T', ' ')) - 10000 > lastAnswerTime) {
          game = this.calculateScore(game)
          await this.quizRepository.finishGame(game);
        }
      }
      await this.quizRepository.recordStatistic(game)
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
    let gamePair: GamePairEntity | null;
    gamePair = await this.quizRepository.findPendingGame();
    if (!gamePair) {
      const newGame = GamePairEntity.createGame(null, user);
      const createGame = await this.quizRepository.saveGame(newGame);
      return createGame.id;
    } else {
      if (gamePair.firstPlayerProgress.userId === user.id) {
        throw new ForbiddenException('You cant connect for your own game pair');
      }
      const questions = await this.quizRepository.getQuestionsForGame();
      gamePair.startGame(gamePair, questions, user);
      const saveGame = await this.quizRepository.saveGame(gamePair);
      return saveGame.id;
    }
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
    let player: PlayerProgressEntity;
    let findedGame: GamePairEntity;
    let saveScores: GamePairEntity;
    try {
      findedGame = await this.quizRepository.findGameByUser(user);
    } catch (e) {
      throw new ForbiddenException('No found game');
    }
    if (findedGame.status === GameStatuses.PendingSecondPlayer) {
      throw new ForbiddenException('No active pair');
    }
    if (
      findedGame?.firstPlayerProgress.userId !== user.id &&
      findedGame?.secondPlayerProgress.userId !== user.id
    ) {
      throw new ForbiddenException('User is not owner');
    }
    const isFirstPlayer = findedGame.firstPlayerProgress.userId === user.id;
    player = isFirstPlayer
      ? findedGame.firstPlayerProgress
      : findedGame.secondPlayerProgress;

    if (player.answers.length >= 5) {
      throw new ForbiddenException('No more answers');
    }
    const newAnswer = new AnswerEntity();
    newAnswer.question =
      findedGame.questions![
      findedGame.questions!.length - 5 + player.answers.length
        ];
    newAnswer.playerId = player.user.id;
    newAnswer.body = answerData.answer;
    if (newAnswer.question.correctAnswers.includes(newAnswer.body)) {
      player.score++;
      newAnswer.answerStatus = AnswerStatuses.Correct;
    } else {
      newAnswer.answerStatus = AnswerStatuses.Incorrect;
    }
    player.answers.push(newAnswer);

    let saveAnswer = await this.quizRepository.saveGame(findedGame);
    if (
      saveAnswer.firstPlayerProgress.answers.length === 5 &&
      saveAnswer.secondPlayerProgress.answers.length === 5
    ) {
      findedGame.finishGame(saveAnswer);
      findedGame = this.calculateScore(findedGame);
      saveAnswer = await this.quizRepository.saveGame(findedGame)
      await this.quizRepository.recordStatistic(saveAnswer);
    }
    saveScores = await this.quizRepository.saveGame(saveAnswer)

    if (findedGame.firstPlayerProgress.userId === user.id) {
      return saveScores.firstPlayerProgress.answers[
      saveAnswer.firstPlayerProgress.answers.length - 1
        ].id;
    } else {
      return saveScores.secondPlayerProgress.answers[
      saveAnswer.secondPlayerProgress.answers.length - 1
        ].id;
    }
  }

  calculateScore(gamePair: GamePairEntity) {
    const hasCorrectAnswerFirstPlayer =
      gamePair.firstPlayerProgress.answers.some(
        (item) => item.answerStatus === 'Correct',
      );
    const hasCorrectAnswerSecondPlayer =
      gamePair.secondPlayerProgress.answers.some(
        (item) => item.answerStatus === 'Correct',
      );
    const firstPlayerLastAnswer = gamePair.firstPlayerProgress.answers.at(-1);
    const secondPlayerLastAnswer = gamePair.secondPlayerProgress.answers.at(-1);
    if (
      gamePair.firstPlayerProgress.answers.length === 5 &&
      gamePair.secondPlayerProgress.answers.length === 5
    ) {
      if (
        firstPlayerLastAnswer &&
        secondPlayerLastAnswer &&
        Date.parse(firstPlayerLastAnswer.addedAt) <
        Date.parse(secondPlayerLastAnswer.addedAt) &&
        hasCorrectAnswerFirstPlayer
      ) {
        gamePair.firstPlayerProgress.score++;
      }
      if (!secondPlayerLastAnswer) {
        gamePair.firstPlayerProgress.score++;
      }
      if (
        firstPlayerLastAnswer &&
        secondPlayerLastAnswer &&
        Date.parse(secondPlayerLastAnswer.addedAt) <
        Date.parse(firstPlayerLastAnswer.addedAt) &&
        hasCorrectAnswerSecondPlayer
      ) {
        gamePair.secondPlayerProgress.score++;
      }
      if (!firstPlayerLastAnswer) {
        gamePair.secondPlayerProgress.score++;
      }
    } else {
      if (
        gamePair.firstPlayerProgress.answers.length >
        gamePair.secondPlayerProgress.answers.length
      ) {
        gamePair.firstPlayerProgress.score++;
      } else {
        gamePair.secondPlayerProgress.score++;
      }
    }
    return gamePair;
  }

  //------------------------------------------------------------------------------------------//
  //----------------------------------------QUESTIONS-----------------------------------------//
  //------------------------------------------------------------------------------------------//

  async createNewQuestion(questionData: CreateQuestionInputModel): Promise<string> {
    const newQuestion = await this.quizRepository.createQuestion(questionData);
    return newQuestion.id;
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
