// (C) Copyright 2015 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/* eslint-disable promise/no-nesting */

import { Component, NgZone, OnDestroy } from '@angular/core';
import { NavController, NavParams } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { CoreAppProvider } from '@services/app';
import { CoreNavigator } from '@services/navigator';
import { CoreNetwork } from '@services/network';
import { CoreSitesProvider } from '@services/sites';
import { EventsService } from '../events.service';

@Component({
    selector: 'page-questionnaire',
    templateUrl: './questionnaire.page.html',
})
export class QuestionnairePage implements OnDestroy {

  questions = [];
  surveyDone = false;
  timeline = [];
  isOnline = false;
  answeredAll = false;
  answeredMessage = false;

  userId = null;
  protected onlineObserver: any;

  navParams = new NavParams();
  //   network = new Network();

  constructor(
      public navCtrl: NavController,
      private sitesProvider: CoreSitesProvider,
      private appProvider: CoreAppProvider,
      private _translate: TranslateService,
      private eventsService: EventsService,
      zone: NgZone,
  ) {
      this.getSurveyQuestions();
      this.getUserId();

      this.isOnline = CoreNetwork.isOnline();

      // Refresh online status when changes.
      this.onlineObserver = CoreNetwork.onChange().subscribe(() => {
      // Execute the callback in the Angular zone, so change detection doesn't stop working.
          zone.run(() => {
              this.isOnline = CoreNetwork.isOnline();
          });
      });
  }

  /**
   * Get the id of the currently logged in user.
   */
  getUserId(): void {
      this.userId =
      this.navParams.get('userId')! ||
      this.sitesProvider.getCurrentSite()?.getUserId();
  }

  /**
   * Get the questions for the survey from the webservice.
   *
   * @returns Returns a promise that returns questions data.
   */
  getSurveyQuestions(): Promise<any> {
      return this.sitesProvider.getSite().then((site) => site
          .write('block_isupportsurvey_getsurvey', null)
          .then((response: any) => {
              if (response) {
                  if (response && response.length > 0) {
                      const questions = response[0].questions;

                      // Sort questions
                      questions.sort((a, b) =>
                          a.questionorder > b.questionorder
                              ? 1
                              : b.questionorder > a.questionorder
                                  ? -1
                                  : 0);

                      // Sort answers
                      for (let i = 0; i < questions.length; i++) {
                          questions[i].answers.sort((a, b) =>
                              a.answerorder > b.answerorder
                                  ? 1
                                  : b.answerorder > a.answerorder
                                      ? -1
                                      : 0);
                      }

                      this.questions = questions;

                  }
              }

              return true;
          }));
  }

  /**
   * Send the answers to the survey back to the webservice.
   *
   * @param survey Survey data to be sent.
   * @returns
   * Example: {
   *    userid: 542
   *    answers: [{
   *        questionid: 1, answerid: 4
   *    }]
   * }
   */
  sendSurvey(survey: any): Promise<any> {
      return this.sitesProvider.getSite().then((site) => (
          site
          // TODO send correct userID
              .write('block_isupportsurvey_sendsurvey', survey)
              .then(() => true)
              .catch(() => {
                  // Error sending
              })
      ));
  }

  /**
   * Handles the click on the submit button.
   */
  async submit(): Promise<any> {
      if (!this.userId) {
          return;
      }

      let answeredCount = 0;
      const survey = {};
      const chosenAnswers = <any>[];
      const questionElements = Array.from(document.querySelectorAll('.question'));

      if (!questionElements) {
          return;
      }

      questionElements.forEach((question) => {
          const currentAnswer = {};
          const questionId = (question as HTMLElement).dataset.questionId;
          const checkedAnswer = Array.from(
              question.querySelectorAll(`input[name="answer-for-${questionId}"]`),
          ).find(
              (inputElement) => (inputElement as HTMLInputElement).checked === true,
          );

          if (checkedAnswer) {
              currentAnswer['questionid'] = questionId;
              currentAnswer['answerid'] = (
                  checkedAnswer as HTMLElement
              ).dataset.answerId;

              chosenAnswers.push(currentAnswer);
              answeredCount++;
          }
      });

      survey['userid'] = this.userId;
      survey['answers'] = chosenAnswers;

      if (survey && answeredCount === questionElements.length) {
          await this.sendSurvey(survey);
          this.answeredMessage = false;
          this.answeredAll = false;
      } else {
          this.answeredMessage = true;
      }

      this.navCtrl.back();
      this.eventsService.publish('questionnaire:submitted');
  }

  onInputChange(): void {
      let answeredCount = 0;

      const questionElements = Array.from(document.querySelectorAll('.question'));

      if (!questionElements) {
          return;
      }

      questionElements.forEach((question) => {
          const questionId = (question as HTMLElement).dataset.questionId;
          const checkedAnswer = Array.from(
              question.querySelectorAll(`input[name="answer-for-${questionId}"]`),
          ).find(
              (inputElement) => (inputElement as HTMLInputElement).checked === true,
          );

          if (checkedAnswer) {
              answeredCount++;
          }
      });

      if (answeredCount === questionElements.length) {
          this.answeredAll = true;
      } else {
          this.answeredAll = false;
      }
  }

  renderAnsweredMessage(): void {
      if (!this.answeredAll) {
          this.answeredMessage = true;
      }
  }

  handleBack(): void {
      CoreNavigator.navigate('/main/home/dashboard', {});
  }

  /**
   * Component being destroyed.
   */
  ngOnDestroy(): void {
      this.onlineObserver && this.onlineObserver.unsubscribe();
  }

}
