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
Justin writes here

## Verifying the Vertical Slice
To verify that Tidy's vertical slice is working:
 - Open the Tidy website and log in to your account.
 - Navigate to the To-do page and click the Add Task button.
 - Enter the task details and save the task.
 - Confirm that the new task appears in your task list.
 - Refresh the page and verify that the task is still there.
If the task remains after refreshing, this confirms that the task was successfully saved to Supabase and retrieved from the database rather than being stored only temporarily in the browser.
