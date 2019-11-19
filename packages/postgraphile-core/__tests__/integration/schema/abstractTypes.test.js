const core = require("./core");

test(
  "prints a schema with star wars types correctly",
  core.test(["sw"], {
    disableDefaultMutations: true,
    simpleCollections: "only",
  })
);
test(
  "prints a schema with abstract types correctly",
  core.test(["abstract"], {
    disableDefaultMutations: true,
    simpleCollections: "only",
  })
);
