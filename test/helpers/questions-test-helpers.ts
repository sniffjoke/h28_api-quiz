import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConfigurationType } from '../../src/core/settings/env/configuration';
import request from 'supertest';
import { codeAuth } from './test-helpers';
import { CreateQuestionInputModel } from '../../src/features/quiz/api/models/input/create-question.input.model';

export class QuestionsTestManager {
  constructor(
    protected readonly app: INestApplication,
    private configService: ConfigService<ConfigurationType, true>,
  ) {
  }

  async createQuestion(createModel: CreateQuestionInputModel) {
    const apiSettings = this.configService.get('apiSettings', { infer: true });
    const response = await request(this.app.getHttpServer())
      .post('/sa/quiz/questions')
      .send(createModel)
      .set({ 'Authorization': `Basic ` + codeAuth(apiSettings.ADMIN) });
    return response;
  }

  // async createBlogWOAuth(createModel: BlogCreateModel) {
  //   const response = await request(this.app.getHttpServer())
  //     .post('/sa/blogs')
  //     .send(createModel);
  //   return response;
  // }

  async updateQuestion(updModel: CreateQuestionInputModel, questionId: string) {
    const apiSettings = this.configService.get('apiSettings', { infer: true });
    const response = await request(this.app.getHttpServer())
      .put('/sa/quiz/questions/' + `${questionId}`)
      .send(updModel)
      .set({ 'Authorization': `Basic ` + codeAuth(apiSettings.ADMIN) });
    return response;
  }

  async getQuestions() {
    const apiSettings = this.configService.get('apiSettings', { infer: true });
    const response = await request(this.app.getHttpServer())
      .get('/sa/quiz/questions/')
      .set({ 'Authorization': `Basic ` + codeAuth(apiSettings.ADMIN) });
    return response;
  }

  // async getQuestionsWOSA() {
  //   const response = await request(this.app.getHttpServer())
  //     .get('/sa/blogs/')
  //   return response;
  // }

  async getQuestionById(blogId: string) {
    const response = await request(this.app.getHttpServer())
      .get('/blogs/' + `${blogId}`);
    return response;
  }

  async deleteQuestion(questionId: string) {
    const apiSettings = this.configService.get('apiSettings', { infer: true });
    const response = await request(this.app.getHttpServer())
      .delete('/sa/quiz/questions/' + `${questionId}`)
      .set({ 'Authorization': `Basic ` + codeAuth(apiSettings.ADMIN) })
      .expect(204);
    return response;
  }

}

export const createMockQuestion = (uniqueIndex: number): CreateQuestionInputModel => ({
  body: 'body10SymbolsMin' + `${uniqueIndex}`,
  correctAnswers: ['Correct'],
});
