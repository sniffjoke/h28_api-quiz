import { ExecutionContext, INestApplication } from '@nestjs/common';
import { initSettings } from '../helpers/init-settings';
import { deleteAllData } from '../helpers/delete-all-data';
import {
  createMockQuestion,
  QuestionsTestManager,
} from '../helpers/questions-test-helpers';
import { GameTestManager } from '../helpers/game-test-helpers';
import {
  createMockUser,
  UsersTestManager,
} from '../helpers/users-test-helpers';
import { UsersService } from '../../src/features/users/application/users.service';
import { AuthTestManager, mockLoginData } from '../helpers/auth-test-helpers';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';

describe('QuizController (e2e)', () => {
  let app: INestApplication;
  let questionManager: QuestionsTestManager;
  let gameManager: GameTestManager;
  let usersManager: UsersTestManager;
  let usersService: UsersService;
  let authManager: AuthTestManager;
  let user1;
  let user2;
  let login1;
  let login2;

  beforeAll(async () => {
    const result = await initSettings((moduleBuilder) =>
      moduleBuilder
        .overrideGuard(ThrottlerGuard)
        .useValue({
          canActivate: (_context: ExecutionContext) => true, // Разрешаем все запросы
        })
        .overrideProvider(JwtService)
        .useValue(
          new JwtService({
            secret: 'secret_key',
            signOptions: { expiresIn: '2s' },
          }),
        ),
    );
    app = result.app;
    questionManager = result.questionTestManager;
    gameManager = result.gameTestManager;
    usersManager = result.userTestManager;
    usersService = result.usersService;
    authManager = result.authTestManager;
    await deleteAllData(app)
  });

  afterAll(async () => {
    await app.close();
  });

  // beforeEach(async () => {
    // await deleteAllData(app);
  // });

  describe('/pair-game-quiz/pairs (e2e)', () => {
    it('/pair-game-quiz/pairs/connection (POST)', async () => {
      const emailConfirmationInfo = usersService.createEmailConfirmation(true);
      user1 = await usersManager.createUser(
        createMockUser(1),
        emailConfirmationInfo,
      );
      user2 = await usersManager.createUser(
        createMockUser(2),
        emailConfirmationInfo,
      );
      login1 = await authManager.login(mockLoginData(1));
      login2 = await authManager.login(mockLoginData(2));
      for (let i = 1; i < 6; i++) {
        const question = await questionManager.createQuestion(
          createMockQuestion(i),
        );
      }
      const createGame = await gameManager.createGameOrConnect(
        login1.body.accessToken,
      );
      const connectGame = await gameManager.createGameOrConnect(
        login2.body.accessToken,
      );
      // console.log('create: ', createGame.body);
      // console.log('conn: ', connectGame.body);
      // const question = await questionManager.createQuestion(
      //   createMockQuestion(1),
      // );
      expect(createGame.status).toBe(200);
      expect(createGame.body).toHaveProperty('id');
      expect(createGame.body).toHaveProperty('firstPlayerProgress');
      expect(createGame.body).toHaveProperty('secondPlayerProgress');
      expect(createGame.body).toHaveProperty('questions');
      expect(createGame.body).toHaveProperty('status');
      expect(createGame.body).toHaveProperty('pairCreatedDate');
      expect(createGame.body).toHaveProperty('startGameDate');
      expect(createGame.body).toHaveProperty('finishGameDate');
      expect(new Date(createGame.body.pairCreatedDate).toISOString()).toContain('T');
      expect(createGame.body).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          firstPlayerProgress: expect.any(Object),
          secondPlayerProgress: expect.any(Object),
          questions: null,
          status: expect.any(String),
          pairCreatedDate: expect.any(String),
          startGameDate: null,
          finishGameDate: null,
        }),
      );
      // expect(question.body.createdAt).toBeDefined();
    });

    it('/pair-game-quiz/pairs/my-current (GET)', async () => {
      const response = await gameManager.getUnfinishedGame(
        login1.body.accessToken,
      );
      // console.log('game: ', response.body);
      // const question = await questionManager.createQuestion(
      //   createMockQuestion(1),
      // );
      // expect(question.body.createdAt).toBeDefined();
    });

    it('/pair-game-quiz/pairs/my (GET)', async () => {
      const response = await gameManager.getAllMyGames(
        login1.body.accessToken,
      );
      // console.log('game: ', response.body);
      // const question = await questionManager.createQuestion(
      //   createMockQuestion(1),
      // );
      // expect(question.body.createdAt).toBeDefined();
    });

    it('/pair-game-quiz/pairs/:id (GET)', async () => {
      const emailConfirmationInfo = usersService.createEmailConfirmation(true);
      const user3 = await usersManager.createUser(
        createMockUser(3),
        emailConfirmationInfo,
      );
      const login3 = await authManager.login(mockLoginData(3));
      const createGame = await gameManager.createGameOrConnect(login3.body.accessToken);
      const response = await gameManager.getGameById(
        login3.body.accessToken,
        createGame.body.id,
      );
      console.log('game: ', response.body);
      // const question = await questionManager.createQuestion(
      //   createMockQuestion(1),
      // );
      // expect(question.body.createdAt).toBeDefined();
    });

  });
});
