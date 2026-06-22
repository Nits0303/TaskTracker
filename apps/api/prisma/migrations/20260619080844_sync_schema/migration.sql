-- DropIndex
DROP INDEX "Project_name_trgm_idx";

-- DropIndex
DROP INDEX "Project_searchVector_idx";

-- DropIndex
DROP INDEX "SubTask_searchVector_idx";

-- DropIndex
DROP INDEX "SubTask_title_trgm_idx";

-- DropIndex
DROP INDEX "Task_searchVector_idx";

-- DropIndex
DROP INDEX "Task_title_trgm_idx";

-- AlterTable
-- ALTER TABLE "Project" ALTER COLUMN "searchVector" DROP DEFAULT;

-- AlterTable
-- ALTER TABLE "SubTask" ALTER COLUMN "searchVector" DROP DEFAULT;

-- AlterTable
-- ALTER TABLE "Task" ALTER COLUMN "searchVector" DROP DEFAULT;
