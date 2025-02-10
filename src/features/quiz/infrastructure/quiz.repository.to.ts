import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GamePairEntity } from '../domain/game-pair.entity';
import {
  AnswerStatuses,
  GameStatuses,
} from '../api/models/input/create-pairs-status.input.model';
import { QuestionEntity } from '../domain/question.entity';
import { PlayerProgressEntity } from '../domain/player-progress.entity';
import { UserEntity } from '../../users/domain/user.entity';
import { AnswerEntity } from '../domain/answer.entity';
import { CreateQuestionInputModel } from '../api/models/input/create-question.input.model';
import { UpdatePublishStatusInputModel } from '../api/models/input/update-publish-status.input.model';
import { UserScoreEntity } from '../domain/user-score.entity';
import { GenerateStatisticHandler } from '../domain/generate-statistic.handler';
import { LoggerService } from '../../../logger.service';

@Injectable()
export class QuizRepositoryTO {
  constructor(
    @InjectRepository(GamePairEntity)
    private readonly gRepository: Repository<GamePairEntity>,
    @InjectRepository(QuestionEntity)
    private readonly questionRepository: Repository<QuestionEntity>,
    @InjectRepository(UserScoreEntity)
    private readonly userScoreRepository: Repository<UserScoreEntity>,
    private readonly genStatHandler: GenerateStatisticHandler,
    private logger: LoggerService,
  ) {
    this.logger.setContext(QuizRepositoryTO.name);
    console.log('QuizRepository creating');
  }

  //------------------------------------------------------------------------------------------//
  //-------------------------------------GAMEPAIRS--------------------------------------------//
  //------------------------------------------------------------------------------------------//

  async findAllActiveGames() {
    const activeGames = await this.gRepository.find({
      where: [
        { status: GameStatuses.Active},
      ],
      relations: ['firstPlayerProgress.answers', 'secondPlayerProgress.answers'],
    });
    return activeGames;
  }

  async finishGame(gamePair: GamePairEntity) {
    gamePair.finishGame(gamePair);
    return await this.gRepository.save(gamePair);
  }

  async findLastActiveGameForUser(user: UserEntity) {
    const findLastGameForCurrentUser = await this.gRepository.find({
      where: { status: GameStatuses.Active },
      relations: ['firstPlayerProgress', 'secondPlayerProgress'],
    });
    for (const item of findLastGameForCurrentUser) {
      if (
        item.firstPlayerProgress.userId === user.id ||
        item?.secondPlayerProgress?.userId === user.id
      ) {
        throw new ForbiddenException(
          'You cant connect because have an active game',
        );
      }
    }
    return findLastGameForCurrentUser;
  }

  async findPendingGame() {
    const gamePair = await this.gRepository.findOne({
      where: { status: GameStatuses.PendingSecondPlayer },
      relations: ['questions', 'firstPlayerProgress'],
    });
    return gamePair;
  }

  async getQuestionsForGame() {
    const questions = await this.questionRepository
      .createQueryBuilder('q')
      .orderBy('q.id', 'ASC')
      // .where('q.status = :status', { status: 'publish' })
      .limit(5)
      .getMany();
    return questions;
  }

  async getUserScore(userId: string) {
    const userScore = await this.userScoreRepository.findOne({
      where: { userId },
    });
    return userScore;
  }

  async findOrCreateConnection(user: UserEntity): Promise<number> {
    let gamePair: GamePairEntity | null;
    gamePair = await this.findPendingGame();
    if (!gamePair) {
      const newGame = GamePairEntity.createGame(null, user);
      const createGame = await this.gRepository.save(newGame);
      return createGame.id;
    } else {
      if (gamePair.firstPlayerProgress.userId === user.id) {
        throw new ForbiddenException('You cant connect for your own game pair');
      }
      const questions = await this.getQuestionsForGame();
      gamePair.startGame(gamePair, questions, user);
      const saveGame = await this.gRepository.save(gamePair);
      return saveGame.id;
    }
  }

  async findGameByUser(user: UserEntity) {
    const findedGame = await this.gRepository.findOne({
      where: [
        {
          status: GameStatuses.Active,
          firstPlayerProgress: { userId: user.id },
        },
        {
          status: GameStatuses.Active,
          secondPlayerProgress: { userId: user.id },
        },
        {
          status: GameStatuses.PendingSecondPlayer,
          firstPlayerProgress: { userId: user.id },
        },
        {
          status: GameStatuses.PendingSecondPlayer,
          secondPlayerProgress: { userId: user.id },
        },
      ],
      relations: [
        'firstPlayerProgress.user.score',
        'secondPlayerProgress.user.score',
        'firstPlayerProgress.answers',
        'secondPlayerProgress.answers',
        'questions',
      ],
    });
    if (!findedGame) {
      throw new NotFoundException('No game');
    }

    return findedGame;
  }

  async findGameById(id: number, user: UserEntity) {
    if (!Number.isInteger(id)) {
      throw new BadRequestException('id is not integer');
    }
    const findedGame = await this.gRepository.findOne({
      where: { id },
      relations: [
        'firstPlayerProgress.user.score',
        'secondPlayerProgress.user.score',
        'firstPlayerProgress.answers',
        'secondPlayerProgress.answers',
        'questions',
      ],
    });
    if (!findedGame) {
      throw new NotFoundException(`Game with id ${id} not found`);
    }
    if (
      findedGame?.firstPlayerProgress?.userId !== user.id &&
      findedGame?.secondPlayerProgress?.userId !== user.id
    ) {
      throw new ForbiddenException('User is not participate');
    }
    return findedGame;
  }

  async sendAnswer(answer: string, user: UserEntity) {
    let player: PlayerProgressEntity;
    let findedGame: GamePairEntity;
    let saveScores: GamePairEntity;
    try {
      findedGame = await this.findGameByUser(user);
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
    newAnswer.body = answer;
    if (newAnswer.question.correctAnswers.includes(newAnswer.body)) {
      player.score++;
      newAnswer.answerStatus = AnswerStatuses.Correct;
    } else {
      newAnswer.answerStatus = AnswerStatuses.Incorrect;
    }
    player.answers.push(newAnswer);

    let saveAnswer = await this.gRepository.save(findedGame);
    if (
      saveAnswer.firstPlayerProgress.answers.length === 5 &&
      saveAnswer.secondPlayerProgress.answers.length === 5
    ) {
      findedGame.finishGame(saveAnswer)
      // findedGame.status = GameStatuses.Finished;
      // findedGame.finishGameDate = new Date(Date.now()).toISOString();

      // const hasCorrectAnswerFirstPlayer =
      //   saveAnswer.firstPlayerProgress.answers.some(
      //     (item) => item.answerStatus === 'Correct',
      //   );
      // const hasCorrectAnswerSecondPlayer =
      //   saveAnswer.secondPlayerProgress.answers.some(
      //     (item) => item.answerStatus === 'Correct',
      //   );
      // const firstPlayerLastAnswer =
      //   saveAnswer.firstPlayerProgress.answers.at(-1);
      // const secondPlayerLastAnswer =
      //   saveAnswer.secondPlayerProgress.answers.at(-1);
      // if (
      //   firstPlayerLastAnswer &&
      //   secondPlayerLastAnswer &&
      //   Date.parse(firstPlayerLastAnswer.addedAt) <
      //     Date.parse(secondPlayerLastAnswer.addedAt) &&
      //   hasCorrectAnswerFirstPlayer
      // ) {
      //   findedGame.firstPlayerProgress.score++;
      // }
      // if (
      //   firstPlayerLastAnswer &&
      //   secondPlayerLastAnswer &&
      //   Date.parse(secondPlayerLastAnswer.addedAt) <
      //     Date.parse(firstPlayerLastAnswer.addedAt) &&
      //   hasCorrectAnswerSecondPlayer
      // ) {
      //   findedGame.secondPlayerProgress.score++;
      // }
      findedGame = this.calculateScore(findedGame)
      saveAnswer = await this.gRepository.save(findedGame);
      const [firstUserScore, secondUserScore] = await Promise.all([
        await this.getUserScore(saveAnswer.firstPlayerProgress.user.id),
        await this.getUserScore(saveAnswer.secondPlayerProgress.user.id),
      ]);
      if (firstUserScore && secondUserScore) {
        const [generateStatisticForFirstUser, generateStatisticForSecondUser] =
          await Promise.all([
            await this.genStatHandler.generateStatisticForUser(
              saveAnswer.firstPlayerProgress.user,
            ),
            await this.genStatHandler.generateStatisticForUser(
              saveAnswer.secondPlayerProgress.user,
            ),
          ]);
        Object.assign(firstUserScore, generateStatisticForFirstUser);
        Object.assign(secondUserScore, generateStatisticForSecondUser);
        await this.userScoreRepository.save(firstUserScore);
        await this.userScoreRepository.save(secondUserScore);
      }
    }
    saveScores = await this.gRepository.save(saveAnswer);

    if (findedGame.firstPlayerProgress.userId === user.id) {
      return saveScores.firstPlayerProgress.answers[
        saveAnswer.firstPlayerProgress.answers.length - 1
      ].id;
    } else
      return saveScores.secondPlayerProgress.answers[
        saveAnswer.secondPlayerProgress.answers.length - 1
      ].id;
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
    const firstPlayerLastAnswer =
      gamePair.firstPlayerProgress.answers.at(-1);
    const secondPlayerLastAnswer =
      gamePair.secondPlayerProgress.answers.at(-1);
    if (
      firstPlayerLastAnswer &&
      secondPlayerLastAnswer &&
      Date.parse(firstPlayerLastAnswer.addedAt) <
      Date.parse(secondPlayerLastAnswer.addedAt) &&
      hasCorrectAnswerFirstPlayer
    ) {
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
    return gamePair
  }

  //------------------------------------------------------------------------------------------//
  //-------------------------------------STATISTIC--------------------------------------------//
  //------------------------------------------------------------------------------------------//

  async findStatistic(user: UserEntity) {
    const findedStatistic = await this.userScoreRepository.findOne({
      where: { userId: user.id },
    });
    if (!findedStatistic) {
      throw new NotFoundException(`Stat with userId ${user.id} not found`);
    }
    return findedStatistic;
  }

  //------------------------------------------------------------------------------------------//
  //-------------------------------------Questions--------------------------------------------//
  //------------------------------------------------------------------------------------------//

  async createQuestion(
    questionData: CreateQuestionInputModel,
  ): Promise<string> {
    const question = new QuestionEntity();
    question.body = questionData.body;
    question.correctAnswers = questionData.correctAnswers;
    const newQuestion = await this.questionRepository.save(question);
    return newQuestion.id;
  }

  async findQuestionById(id: string) {
    const findedQuestion = await this.questionRepository.findOne({
      where: { id },
    });
    if (!findedQuestion) {
      throw new NotFoundException(`Question with id ${id} not found`);
    }
    return findedQuestion;
  }

  async updateQuestionById(
    id: string,
    questionData: Partial<CreateQuestionInputModel>,
  ) {
    const findedQuestion = await this.findQuestionById(id);
    Object.assign(findedQuestion, {
      ...questionData,
      updatedAt: new Date(Date.now()).toISOString(),
    });
    return await this.questionRepository.save(findedQuestion);
  }

  async deleteQuestion(id: string) {
    const findedQuestion = await this.findQuestionById(id);
    return await this.questionRepository.delete({ id });
  }

  async updateQuestionPublishStatus(
    id: string,
    updateData: UpdatePublishStatusInputModel,
  ) {
    const findedQuestion = await this.findQuestionById(id);
    findedQuestion.published = updateData.published;
    findedQuestion.updatedAt = new Date(Date.now()).toISOString();
    const updatedQuestion = await this.questionRepository.save(findedQuestion);
    return updatedQuestion;
  }
}
