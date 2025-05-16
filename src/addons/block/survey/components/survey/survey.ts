/* eslint-disable */
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

import {
  Component,
  OnInit,
  OnDestroy,
  Injector,
  Input,
  OnChanges,
  SimpleChange,
  NgZone,
  Injectable,
} from '@angular/core';

import { TranslateService } from '@ngx-translate/core';
// import { Network } from '@ionic-native/network';
import { CoreEventObserver } from '@singletons/events';
import { CoreSitesProvider } from '@services/sites';
import { NavController, NavParams, Platform } from '@ionic/angular';
import {
  CoreCourses,
  CoreCoursesProvider,
  CoreEnrolledCourseData,
} from '@features/courses/services/courses';
import {
  AddonCourseCompletion,
  AddonCourseCompletionProvider,
} from '@addons/coursecompletion/services/coursecompletion';
import { CoreCourseHelperProvider } from '@features/course/services/course-helper';
import {
  CoreCourseOptionsDelegate,
  CoreCourseOptionsDelegateService,
} from '@features/course/services/course-options-delegate';
import {
  CoreCoursesHelperProvider,
  CoreEnrolledCourseDataWithExtraInfoAndOptions,
} from '@features/courses/services/courses-helper';
import { CoreBlockBaseComponent } from '@features/block/classes/base-block-component';
import { CoreUtils } from '@services/utils/utils';
import { PageLoadsManager } from '@classes/page-loads-manager';
import { PageLoadWatcher } from '@classes/page-load-watcher';

import { CoreNavigator } from '@services/navigator';
import { CoreNetwork } from '@services/network';

import { Subscription } from 'rxjs';
import { CoreSite } from '@classes/sites/site';
import { EventsService } from '@/app/events.service';
// import { CoreNetwork } from '@services/network';

/**
 * Component to render a recent courses block.
 */
@Component({
  selector: 'addon-block-survey',
  templateUrl: 'addon-block-survey.html',
})
export class AddonBlockSurveyComponent
  extends CoreBlockBaseComponent
  implements OnInit, OnChanges, OnDestroy
{
  isSurveyDone = true;
  surveyDoneText = '';
  introductionText = '';
  timeline = <any>[];
  courses = [];
  categories = <any>[];
  userId = null;
  isOnline = false;

  prefetchCoursesData = {
    icon: '',
    badge: '',
  };
  downloadCourseEnabled = false;
  downloadCoursesEnabled = false;

  isLayoutSwitcherAvailable = false;

  textFilter = '';
  hasCourses = false;
  searchEnabled = false;
  eventObserver: Subscription;

  protected currentSite!: CoreSite;
  protected allCourses: CoreEnrolledCourseDataWithExtraInfoAndOptions[] = [];
  protected prefetchIconsInitialized = false;
  protected isDirty = false;
  protected isDestroyed = false;
  protected coursesObserver?: CoreEventObserver;
  protected updateSiteObserver?: CoreEventObserver;
  protected fetchContentDefaultError = 'Error getting my overview data.';
  protected gradePeriodAfter = 0;
  protected gradePeriodBefore = 0;
  protected today = 0;
  protected firstLoadWatcher?: PageLoadWatcher;

  protected courseIds = [];
  protected onlineObserver: any;
  protected win: any = window;

  public navParams = new NavParams();
  // public network = new Network();

  constructor(
    private navCtrl: NavController,
    private coursesProvider: CoreCoursesProvider,
    private courseCompletionProvider: AddonCourseCompletionProvider,
    private courseHelper: CoreCourseHelperProvider,
    private courseOptionsDelegate: CoreCourseOptionsDelegateService,
    private coursesHelper: CoreCoursesHelperProvider,
    private sitesProvider: CoreSitesProvider,
    private _translate: TranslateService,
    private platform: Platform,
    private eventsService: EventsService,
    zone: NgZone,
  ) {
    super('AddonBlockSurveyComponent');

    this.userId =
      this.navParams.get('userId')! ||
      this.sitesProvider.getCurrentSite()?.getUserId();
    this.isOnline = CoreNetwork.isOnline();

    console.log('IS ONLINE? ', this.isOnline);
    console.log(this.userId);

    // Refresh online status when changes.
    this.onlineObserver = CoreNetwork.onChange().subscribe(() => {
      // Execute the callback in the Angular zone, so change detection doesn't stop working.
      zone.run(() => {
        this.isOnline = CoreNetwork.isOnline();

        if (!this.isOnline) {
          this.timeline = JSON.parse(localStorage.getItem('timeline')!);
          this.surveyDoneText = localStorage.getItem('surveyDoneText')!;
          this.introductionText = localStorage.getItem('introductionText')!;
        } else {
          this.refreshTimeline();
        }
      });
    });

    // Subscribe to questionnaire submission event
    this.eventObserver = this.eventsService.subscribe('questionnaire:submitted', () => {
      this.refreshTimeline();
    });
  }

  /**
   * Component being initialized.
   */
  async ngOnInit(): Promise<void> {
    console.log('ON INIT GETTING DATA');
    this.timeline = JSON.parse(localStorage.getItem('timeline')!);
    console.log("TIMELINE", JSON.parse(localStorage.getItem('timeline')!));
    this.getData(this.userId!);
  }

  /**
   * Detect changes on input properties.
   */
  ngOnChanges(changes: { [name: string]: SimpleChange }): void {
    console.log('Changed!')
    this.getData(this.userId!);
  }

  refreshTimeline() {
    if(!this.isOnline){
      this.timeline = JSON.parse(localStorage.getItem('timeline')!);
      return;
    }
    console.log('refreshing');
    let button = document.getElementById('button-rotate');
    if (button) {
      button.classList.remove('spin');
      button.classList.add('spin');
    }

    this.timeline = [];
    this.getData(this.userId!);
  }

  /**
   * Get data for the survey from the webservice.
   *
   * @param userId Get survey data from this user.
   * @return Returns a promise that returns survey data.
   */
   getData(userId: number): Promise<void> {
    console.log('Getting data');
    if (!userId) {
      return Promise.resolve();
    }

    return this.sitesProvider.getSite().then((site) => {
      console.log(site);
      return (

        site
          // TODO send correct userID
          .write('block_isupportsurvey_checksurveydone', { userid: userId })
          .then(async (response: any) => {
            if (response && (<any>response).length > 0) {
              this.isSurveyDone = response[0].done;
              this.surveyDoneText = this.nl2br(
                response[0].surveydonetext,
                false
              );
              this.introductionText = this.nl2br(
                response[0].introductiontext,
                false
              );

              this.categories = await this.coursesProvider.getCategories(
                0,
                false
              );

              this.timeline = [];

              console.log('FETCHED WEBSERIVCE', response[0].timeline.length);

              // Populate timeline with courses data
              for (let i = 0; i < response[0].timeline.length; i++) {
                await this.getCourseData(response[0].timeline[i].courseid);
              }

              console.log('GOT COURSES', this.timeline);

              localStorage.setItem('timeline', JSON.stringify(this.timeline));
              localStorage.setItem(
                'introductionText',
                JSON.stringify(this.introductionText)
              );
              localStorage.setItem(
                'surveyDoneText',
                JSON.stringify(this.surveyDoneText)
              );
            }
          })
      );
    });
  }

  /**
   * Get the data of a course.
   *
   * @param courseId Course ID to get the data of.
   * @return Returns a promise that returns course data when resolved.
   */
  getCourseData(courseId: number): Promise<any> {
    console.log(courseId);

    return this.courseHelper
      .getCourse(courseId)
      .then((result) => {
        return result.course;
      })
      .catch(() => {
        // Error getting the course, probably guest access.
      })
      .then((course: CoreCourseExtended) => {
        if (!course) {
          return;
        }

        if (course.overviewfiles && course.overviewfiles.length > 0) {
          course.courseImage = course.overviewfiles[0].fileurl;
        }

        let categoryname = '';
        let categoryid: any = '';

        for (let i = 0; i < this.categories.length; i++) {
          if (
            this.categories[i].id === course.category ||
            this.categories[i].id === course.categoryid
          ) {
            categoryname = this.categories[i].name;
            if (course.category) {
              categoryid = course.category;
            } else if (course.categoryid) {
              categoryid = course.categoryid;
            }
          }
        }

        if (categoryname) {
          course.categoryname = categoryname;
          course.category_id = categoryid;
        } else {
          course.categoryname = ' ';
          course.category_id = '';
        }

        this.timeline.push(course);
      });
  }

  /**
   * Get the course image url from the course data.
   *
   * @param course Course data.
   * @return Return the image file url.
   */
  getCourseImageUrl(course: any): string {
    if (course.overviewfiles && course.overviewfiles.length > 0) {
      return course.overviewfiles[0].fileurl;
    }

    return '';
  }

  /**
   * Handle the click on a course card.
   *
   * @param course Course data to navigate to.
   */
  courseClicked(course: any): void {
    this.courseHelper.openCourse(course);
  }

  openQuestionnaire(): void {
    CoreNavigator.navigate('/questionnaire');
  }

  /**
   * Converts metacharacters to HTML tags
   *
   * @param str String to be converted.
   * @param is_xhtml Defines if the str parameter is of type XHTML
   * @return Converted string
   */
  nl2br(str, is_xhtml): string {
    if (typeof str === 'undefined' || str === null) {
      return '';
    }
    var breakTag =
      is_xhtml || typeof is_xhtml === 'undefined' ? '<br />' : '<br>';
    return (str + '').replace(
      /([^>\r\n]?)(\r\n|\n\r|\r|\n)/g,
      '$1' + breakTag + '$2'
    );
  }

  /**
   * Check if a certain course is in the list of courses.
   *
   * @param courseId Course ID to search.
   * @return Whether it's in the list.
   */
  protected hasCourse(courseId: number): boolean {
    if (!this.courses) {
      return false;
    }

    return !!this.courses.find((course: CoreCourseExtended) => {
      return course.id == courseId;
    });
  }

  /**
   * Component being destroyed.
   */
  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.coursesObserver && this.coursesObserver.off();
    this.updateSiteObserver && this.updateSiteObserver.off();
    this.onlineObserver && this.onlineObserver.unsubscribe();
  }
}

interface CoreCourseExtended extends CoreEnrolledCourseData {
  id: number;
  courseImage: string;
  category: string;
  categoryid: number;
  category_id: string;
  categoryname: string;
}
