const { importFaculty } = require('./import-faculty');
const facultyData = require('../data/sumanSaha');

if (require.main === module) {
  importFaculty(facultyData)
    .then(({ userId, publicationCount }) => {
      console.log(`Imported ${facultyData.profile.fullName} (${userId}) with ${publicationCount} publications.`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  importSuman: () => importFaculty(facultyData),
};
