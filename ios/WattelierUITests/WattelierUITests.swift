import XCTest

final class WattelierUITests: XCTestCase {
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func open(_ section: String, in app: XCUIApplication) {
        if app.tabBars.firstMatch.exists {
            if section == "Facturation" {
                app.tabBars.buttons["Plus"].tap()
                XCTAssertTrue(app.navigationBars["Plus"].waitForExistence(timeout: 5))
                app.staticTexts["Facturation"].tap()
            } else {
                app.tabBars.buttons[section].tap()
            }
        } else {
            app.buttons[section].tap()
        }
    }

    func testFirstLaunchWelcomeCardsLeadToConnection() {
        let app = XCUIApplication()
        app.launchArguments = ["-uitesting-welcome"]
        app.launch()

        XCTAssertTrue(app.staticTexts["Bienvenue dans Wattelier"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["Des mesures qui restent justes"].exists)
        XCTAssertTrue(app.staticTexts["Le direct et les commandes"].exists)
        XCTAssertTrue(app.staticTexts["Vos données restent chez vous"].exists)
        app.buttons["Continuer"].tap()
        XCTAssertTrue(app.staticTexts["Accéder à mon serveur"].waitForExistence(timeout: 5))
    }

    func testDemoNavigation() {
        let app = XCUIApplication()
        app.launchArguments = ["-uitesting-demo"]
        app.launch()

        XCTAssertTrue(app.navigationBars["Aujourd’hui"].waitForExistence(timeout: 8))
        app.tabBars.buttons["Appareils"].tap()
        XCTAssertTrue(app.navigationBars["Appareils"].waitForExistence(timeout: 5))
    }

    func testTabsReuseLiveDataWithoutBlockingLoader() {
        let app = XCUIApplication()
        app.launchArguments = ["-uitesting-demo"]
        app.launch()

        app.tabBars.buttons["Direct"].tap()
        XCTAssertTrue(app.navigationBars["Temps réel"].waitForExistence(timeout: 8))
        XCTAssertFalse(app.staticTexts["Connexion au direct…"].exists)
        XCTAssertTrue(app.staticTexts["684 W"].waitForExistence(timeout: 5))

        app.tabBars.buttons["Accueil"].tap()
        app.tabBars.buttons["Direct"].tap()
        XCTAssertTrue(app.staticTexts["684 W"].exists)
        XCTAssertFalse(app.staticTexts["Connexion au direct…"].exists)
    }

    func testAppStoreScreenshots() {
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(fr)", "-AppleLocale", "fr_FR", "-uitesting-demo"]
        app.launch()

        XCTAssertTrue(app.navigationBars["Aujourd’hui"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["684 W"].waitForExistence(timeout: 8))
        capture("01-aujourdhui")

        open("Direct", in: app)
        XCTAssertTrue(app.navigationBars["Temps réel"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["684 W"].waitForExistence(timeout: 5))
        capture("02-temps-reel")

        open("Historique", in: app)
        XCTAssertTrue(app.navigationBars["Historique"].waitForExistence(timeout: 8))
        capture("03-historique")

        open("Appareils", in: app)
        XCTAssertTrue(app.navigationBars["Appareils"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["Lave-vaisselle"].waitForExistence(timeout: 5))
        capture("04-appareils")

        open("Facturation", in: app)
        XCTAssertTrue(app.navigationBars["Facturation"].waitForExistence(timeout: 8))
        capture("05-facturation")
    }
}
