# IS401-Todo-List
## App Summary
Students often struggle to manage assignments and deadlines across multiple courses and platforms. Tidy is a student focused task management app designed to organize coursework, manage tasks, and keep track of changing deadlines. The application combines a daily task overview, interactive to-do lists, and a calendar view into one platform. The main goal of Tidy is to simplify assignment tracking through planned Canvas integration, allowing students to manage and update their academic responsibilities more efficiently. By emphasizing simplicity and user experience, Tidy helps students stay organized without adding unnecessary complexity to their schedules. 

## Entity-Relationship Diagram
![Project ERD](images/IS401ERD.png "ERD")

## Tech Stack
- **Frontend:** Built using HTML, CSS, and JavaScript.
- **Backend & Database:** Supabase was used to handle all backend and database needs to create durable information.
- **Hosting:** GitHub Pages was used to host the website and allow easy access.
- **Why this approach:** We used this tech stack due to its familiarity from other projects. It was the easiest option for us to implement given the time frame and it serves all our needs perfectly.

## How to Get It Running
1. Navigate to the website URL: https://jonathonfernelius.github.io/IS401-Todo-List/index.html
2. If you already have an account, log in using your email & password
3. If you don't, click on the 'Create an Account' button.
4. After being redirected to the account creation page, fill out the required information and create your account
5. Confirm the account creation was successful
6. Awesome! You have your account, you are now on the home page of the website (aka the 'Today' page on the navbar) Here you can view your tasks due today, overdue tasks, and tasks for this week.
7. Navigate to the 'profile' page using the navbar or by clicking on your profile picture.
8. Set your preferences for color theme or calendar view. You will also be able to integrate with canvas here once the functionality is added.
9. Navigate back to any of the other 3 pages on the navbar. It's time to learn how to add tasks.
## Adding Tasks
10. In the upper right corner of the today / to-do / calendar pages, there is a button to add tasks, click on it.
11. Fill out the required information, this will include
12. The Name of the task (what you will call it)
13. Assigning the task to a list (Default options include School, Work, or Personal. You may add more as you desire)
14. Assigning the task a category (These are defined by the user and are intended to be more specific attributes to list items. ex - Homework, Projects, Sports)
15. Set a Due Date (When you want to accomplish the task by)
16. (Optional) Assign a specific time to the Due Date
17. Choose if the the task/events reoccurs. If so, choose how often it does under the repeat option.
18. Set a reminder (Functionality not added yet)
19. Create the task.
20. The task is now created and can be viewed in the today / to-do / calendar pages.
21. Mark the task off as complete when finished.

## Verifying the Vertical Slice
To verify that the account creation vertical slice is working:
1. Open the website.
2. Click the Sign Up button to create a new account.
3. Enter the required account information and submit the form.
4. Confirm that the account was successfully created.
5. Refresh the page and verify that the user remains logged in.
6. Check Supabase to confirm that the new account information was saved to the database.

If the account remains accessible after refreshing, this demonstrates that the frontend successfully communicates with Supabase and that user account information persists.
