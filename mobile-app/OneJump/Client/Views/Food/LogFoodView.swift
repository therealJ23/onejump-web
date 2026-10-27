import SwiftUI
import AVFoundation
import PhotosUI
import VisionKit

/// Logging food four ways: photo, voice, barcode or search.
/// Assist reads what it can, then the client checks portions before anything is saved.
struct LogFoodView: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    switch store.logStage {
                    case .photo: photoStage
                    case .voice: voiceStage
                    case .barcode: barcodeStage
                    case .search: SearchFoodsStage()
                    case .reading: readingStage
                    case .review: ReviewFoodsStage()
                    }
                }
                .padding(16)
                .frame(maxWidth: 640)
                .frame(maxWidth: .infinity)
                .animation(.snappy, value: store.logStage)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Palette.bg.ignoresSafeArea())
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        store.showFoodLogger = false
                    } label: {
                        Image(systemName: "xmark")
                    }
                    .accessibilityLabel(CLT.close(lang))
                }
            }
        }
    }

    private var title: String {
        switch store.logMode {
        case .photo: return CLT.logPhotoTitle(lang)
        case .voice: return CLT.logVoiceTitle(lang)
        case .barcode: return CLT.logBarcodeTitle(lang)
        case .search: return CLT.logSearchTitle(lang)
        }
    }

    // MARK: Photo

    private var photoStage: some View {
        PhotoStage()
    }

    // MARK: Voice

    private var voiceStage: some View {
        let listening = store.listenMode == .food
        return VStack(spacing: 18) {
            Button { store.listenForFood() } label: {
                VoiceOrb(active: listening, showsArc: false)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(CLT.sayAte(lang))
            .padding(.top, 30)
            Text(listening ? (store.voice.heard.isEmpty ? CLT.listening(lang) : store.voice.heard) : CLT.tapAndSay(lang))
                .font(.archivo(24, .bold))
                .multilineTextAlignment(.center)
                .foregroundStyle(Palette.ink)
                .padding(.top, 14)
            SubText(CLT.sayExample(lang))
                .multilineTextAlignment(.center)
                .frame(maxWidth: 300)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: Barcode

    private var barcodeStage: some View {
        BarcodeScanStage()
    }

    // MARK: Reading

    private var readingStage: some View {
        VStack(spacing: 14) {
            ProgressView()
                .controlSize(.large)
                .tint(Palette.progressGreen)
            Text(readingText).font(OJFont.title).foregroundStyle(Palette.ink)
            if !store.heardFood.isEmpty {
                SubText("“\(store.heardFood)”").multilineTextAlignment(.center).frame(maxWidth: 280)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 120)
    }

    private var readingText: String {
        switch store.logMode {
        case .photo: return CLT.readingPhoto(lang)
        case .barcode: return CLT.foundIt(lang)
        default: return CLT.findingFoods(lang)
        }
    }
}

// MARK: - Photo

/// Take a photo of the plate (or choose one); Assist reads it and the client checks the foods.
private struct PhotoStage: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang
    @State private var showCamera = false
    @State private var pickerItem: PhotosPickerItem?

    var body: some View {
        VStack(spacing: 18) {
            CameraFrame(tip: store.foodPhoto == nil ? CLT.fitPlate(lang) : "") {
                if let photo = store.foodPhoto {
                    Image(uiImage: photo)
                        .resizable()
                        .scaledToFill()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
                } else {
                    PlateIllustration()
                }
            }
            Button {
                if PhotoCamera.isAvailable { showCamera = true } else { store.toast.show(CLT.noCameraPhoto(lang)) }
            } label: {
                Circle()
                    .fill(Palette.volt)
                    .frame(width: 72, height: 72)
                    .overlay(Image(systemName: "camera.fill").font(.system(size: 24, weight: .bold)).foregroundStyle(Color(hex: 0x12281F)))
                    .overlay(Circle().stroke(Palette.line2, lineWidth: 5))
                    .padding(4)
                    .overlay(Circle().stroke(Palette.surface, lineWidth: 4))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(CLT.takePhoto(lang))
            PhotosPicker(selection: $pickerItem, matching: .images) {
                Label(CLT.choosePhoto(lang), systemImage: "photo.on.rectangle")
            }
            .buttonStyle(.oj(.ghost, fullWidth: true))
            SubText(CLT.photoNote(lang)).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .fullScreenCover(isPresented: $showCamera) {
            PhotoCamera { image in
                showCamera = false
                if let image { store.analyzePhoto(image) }
            }
            .ignoresSafeArea()
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task { @MainActor in
                defer { pickerItem = nil }
                guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) else {
                    store.toast.show(CLT.photoUnreadable(lang))
                    return
                }
                store.analyzePhoto(image)
            }
        }
    }
}

/// The system camera, for one still photo.
struct PhotoCamera: UIViewControllerRepresentable {
    static var isAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }
    var onDone: (UIImage?) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onDone: onDone) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.cameraCaptureMode = .photo
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ picker: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onDone: (UIImage?) -> Void
        init(onDone: @escaping (UIImage?) -> Void) { self.onDone = onDone }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            onDone(info[.originalImage] as? UIImage)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onDone(nil)
        }
    }
}

// MARK: - Barcode scanning

/// The live camera reads the barcode on its own; typing the numbers works too.
private struct BarcodeScanStage: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang
    @Environment(\.openURL) private var openURL
    @State private var access = AVCaptureDevice.authorizationStatus(for: .video)
    @State private var typed = ""

    private var hasCamera: Bool { AVCaptureDevice.default(for: .video) != nil }
    private var denied: Bool { access == .denied || access == .restricted }

    var body: some View {
        VStack(spacing: 16) {
            CameraFrame(tip: tip) {
                if access == .authorized && hasCamera {
                    Group {
                        // Apple's own scanner (iPhone XS and newer); the plain camera reader otherwise.
                        if DataScannerViewController.isSupported && DataScannerViewController.isAvailable {
                            LiveBarcodeScanner { code in store.lookUpBarcode(code) }
                        } else {
                            BarcodeCameraView { code in store.lookUpBarcode(code) }
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
                    .accessibilityLabel(CLT.pointAtBarcode(lang))
                } else if denied {
                    VStack(spacing: 8) {
                        Image(systemName: "camera.fill").font(.system(size: 30)).foregroundStyle(Palette.volt)
                        Text(CLT.cameraOff(lang)).font(OJFont.title).foregroundStyle(Color(hex: 0xF4F6F1))
                        Text(CLT.cameraOffNote(lang)).font(.archivo(13)).foregroundStyle(Color(hex: 0xE6ECE3).opacity(0.8))
                            .multilineTextAlignment(.center).frame(maxWidth: 260)
                    }
                } else {
                    BarcodeIllustration()
                }
            }
            if access == .notDetermined && hasCamera {
                Button(CLT.turnOnCamera(lang)) { Task { await askForCamera() } }
                    .buttonStyle(.oj(.primary, fullWidth: true))
            }
            if denied {
                Button(CLT.openSettings(lang)) {
                    if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                }
                .buttonStyle(.oj(.ghost, fullWidth: true))
            }
            if let message = store.barcodeMessage {
                Text(message(lang))
                    .font(.archivo(14, .semibold))
                    .foregroundStyle(Palette.ink)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                HStack(spacing: 8) {
                    Button(CLT.methodSearch(lang)) { store.searchMore() }
                        .buttonStyle(.oj(.ghost, fullWidth: true))
                }
            }
            VStack(alignment: .leading, spacing: 8) {
                SubText(CLT.typeBarcode(lang))
                HStack(spacing: 8) {
                    TextField("0 12345 67890 5", text: $typed)
                        .keyboardType(.numberPad)
                        .font(.archivo(16, .semibold))
                        .padding(.horizontal, 14)
                        .frame(height: 46)
                        .background(Palette.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Palette.line2, lineWidth: 1))
                        .accessibilityLabel(CLT.typeBarcode(lang))
                    Button(CLT.lookUp(lang)) { store.lookUpBarcode(typed) }
                        .buttonStyle(.oj(.primary))
                        .disabled(typed.filter(\.isNumber).count < 8)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .task { await askForCamera() }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
            // Back from Settings: pick up a change to camera access.
            access = AVCaptureDevice.authorizationStatus(for: .video)
        }
    }

    @MainActor
    private func askForCamera() async {
        guard AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined else {
            access = AVCaptureDevice.authorizationStatus(for: .video)
            return
        }
        let ok = await AVCaptureDevice.requestAccess(for: .video)
        access = ok ? .authorized : .denied
    }

    private var tip: String {
        if denied { return "" }
        if !hasCamera { return CLT.noCamera(lang) }
        return CLT.holdSteady(lang)
    }
}

/// Apple's live scanner (VisionKit): finds and reads a food barcode with focus, zoom and
/// highlighting handled by iOS.
private struct LiveBarcodeScanner: UIViewControllerRepresentable {
    var onCode: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.ean13, .ean8, .upce, .code128])],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: false,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        // Scanning can only start once the camera view is on screen.
        DispatchQueue.main.async { try? scanner.startScanning() }
        return scanner
    }

    func updateUIViewController(_ scanner: DataScannerViewController, context: Context) {
        context.coordinator.onCode = onCode
        if !scanner.isScanning && !context.coordinator.handled { try? scanner.startScanning() }
    }

    static func dismantleUIViewController(_ scanner: DataScannerViewController, coordinator: Coordinator) {
        scanner.stopScanning()
    }

    @MainActor
    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        var onCode: (String) -> Void
        var handled = false

        init(onCode: @escaping (String) -> Void) {
            self.onCode = onCode
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            guard !handled else { return }
            for item in addedItems {
                if case .barcode(let barcode) = item, let code = barcode.payloadStringValue, !code.isEmpty {
                    handled = true
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                    dataScanner.stopScanning()
                    onCode(code)
                    return
                }
            }
        }
    }
}

/// The phone's back camera, reading EAN/UPC barcodes (the ones on food packaging).
private struct BarcodeCameraView: UIViewRepresentable {
    var onCode: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.backgroundColor = .black
        context.coordinator.start(in: view)
        return view
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {
        context.coordinator.onCode = onCode
    }

    static func dismantleUIView(_ uiView: PreviewView, coordinator: Coordinator) {
        coordinator.stop()
    }

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }

    final class Coordinator: NSObject, AVCaptureMetadataOutputObjectsDelegate {
        var onCode: (String) -> Void
        private let session = AVCaptureSession()
        private let queue = DispatchQueue(label: "oj.barcode.camera")
        private var handled = false

        init(onCode: @escaping (String) -> Void) {
            self.onCode = onCode
        }

        func start(in view: PreviewView) {
            view.previewLayer.session = session
            view.previewLayer.videoGravity = .resizeAspectFill
            let session = self.session
            queue.async { [weak self] in
                guard let self,
                      let device = AVCaptureDevice.default(for: .video),
                      let input = try? AVCaptureDeviceInput(device: device),
                      session.canAddInput(input) else { return }
                session.beginConfiguration()
                session.addInput(input)
                let output = AVCaptureMetadataOutput()
                if session.canAddOutput(output) {
                    session.addOutput(output)
                    output.setMetadataObjectsDelegate(self, queue: .main)
                    let wanted: [AVMetadataObject.ObjectType] = [.ean13, .ean8, .upce, .code128]
                    output.metadataObjectTypes = wanted.filter { output.availableMetadataObjectTypes.contains($0) }
                }
                session.commitConfiguration()
                // Packages are held close: focus near.
                if (try? device.lockForConfiguration()) != nil {
                    if device.isAutoFocusRangeRestrictionSupported { device.autoFocusRangeRestriction = .near }
                    if device.isFocusModeSupported(.continuousAutoFocus) { device.focusMode = .continuousAutoFocus }
                    device.unlockForConfiguration()
                }
                session.startRunning()
            }
        }

        func stop() {
            let session = self.session
            queue.async {
                if session.isRunning { session.stopRunning() }
            }
        }

        func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
            guard !handled,
                  let code = metadataObjects.compactMap({ $0 as? AVMetadataMachineReadableCodeObject }).first?.stringValue,
                  !code.isEmpty else { return }
            handled = true
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            stop()
            onCode(code)
        }
    }
}

// MARK: - Search

private struct SearchFoodsStage: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        @Bindable var store = store
        let query = store.foodQuery.trimmingCharacters(in: .whitespaces).lowercased()
        let results = ClientData.foods.filter { query.isEmpty || $0.name(lang).lowercased().contains(query) }

        VStack(alignment: .leading, spacing: 12) {
            SearchField(placeholder: CLT.searchFoods(lang), text: $store.foodQuery)
            if results.isEmpty {
                EmptyStateCard(systemImage: "magnifyingglass", title: CLT.noMatch(lang), message: CLT.tryWord(lang))
            } else {
                ListCard {
                    DividedRows(results) { food in
                        Button { store.addSearchResult(food) } label: {
                            HStack {
                                TitleSub(food.name(lang), sub: CLT.foodLine(food.quantity(lang), Fmt.grouped(Int(food.kcal)), Int(food.protein))(lang))
                                Image(systemName: "plus")
                                    .font(.system(size: 13, weight: .bold))
                                    .frame(width: 34, height: 34)
                                    .background(Palette.surface2, in: Circle())
                            }
                            .rowPadding()
                        }
                        .buttonStyle(.row)
                    }
                }
            }
        }
    }
}

// MARK: - Review

private struct ReviewFoodsStage: View {
    @Environment(ClientStore.self) private var store
    @Environment(\.lang) private var lang

    var body: some View {
        let kcal = store.review.reduce(0.0) { $0 + $1.food.kcal * $1.multiplier }
        let protein = store.review.reduce(0.0) { $0 + $1.food.protein * $1.multiplier }

        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(CLT.checkFoods(lang)).font(OJFont.h3).foregroundStyle(Palette.ink)
                SubText(CLT.nothingSaved(lang))
            }
            ListCard {
                DividedRows(store.review) { item in
                    let scaled = item.food.scaled(item.multiplier)
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.food.name(lang)).font(OJFont.title)
                            SubText(CLT.foodLine(scaled.quantity(lang), Fmt.grouped(Int(scaled.kcal.rounded())), Int(scaled.protein.rounded()))(lang))
                            if let source = item.food.source {
                                Text(source(lang)).font(.archivo(11)).foregroundStyle(Palette.muted)
                            }
                        }
                        Spacer(minLength: 0)
                        ValueStepper(
                            value: "\(Fmt.trimmed(item.multiplier))×",
                            minWidth: 40,
                            decreaseLabel: CLT.smaller(lang),
                            increaseLabel: CLT.bigger(lang),
                            onDecrease: { store.changePortion(item.id, by: -0.5) },
                            onIncrease: { store.changePortion(item.id, by: 0.5) }
                        )
                    }
                    .rowPadding()
                }
            }
            HStack {
                Text(CLT.total(lang)).font(OJFont.title)
                Spacer()
                Text(CLT.reviewTotal(Fmt.grouped(Int(kcal.rounded())), Int(protein.rounded()))(lang)).font(OJFont.title)
            }
            .padding(.horizontal, 4)

            Eyebrow(CLT.addToTitle(lang)).padding(.leading, 4)
            HStack(spacing: 8) {
                ForEach(Meal.allCases, id: \.self) { meal in
                    Chip(label: meal.name(lang), isOn: store.reviewMeal == meal) {
                        withAnimation(.snappy) { store.reviewMeal = meal }
                    }
                }
            }
            Button(CLT.addTo(store.reviewMeal.name(lang).lowercased())(lang)) { store.addReviewedFoods() }
                .buttonStyle(.oj(.primary, size: .large, fullWidth: true))
            Button(CLT.addAnother(lang)) { store.searchMore() }
                .buttonStyle(.oj(.ghost, fullWidth: true))
        }
    }
}

// MARK: - Camera-style frames

/// Dark "viewfinder" with volt corners, used for photo and barcode logging.
struct CameraFrame<Content: View>: View {
    let tip: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 26, style: .continuous).fill(Color(hex: 0x0C1712))
            content()
            ViewfinderCorners()
                .stroke(Palette.volt, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .padding(22)
            VStack {
                Spacer()
                Text(tip)
                    .font(.archivo(13, .semibold))
                    .foregroundStyle(Color(hex: 0xE6ECE3).opacity(0.85))
                    .padding(.bottom, 18)
            }
        }
        .frame(height: 380)
    }
}

private struct ViewfinderCorners: Shape {
    func path(in rect: CGRect) -> Path {
        let l: CGFloat = 34
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.minY + l)); p.addLine(to: CGPoint(x: rect.minX, y: rect.minY)); p.addLine(to: CGPoint(x: rect.minX + l, y: rect.minY))
        p.move(to: CGPoint(x: rect.maxX - l, y: rect.minY)); p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY)); p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + l))
        p.move(to: CGPoint(x: rect.minX, y: rect.maxY - l)); p.addLine(to: CGPoint(x: rect.minX, y: rect.maxY)); p.addLine(to: CGPoint(x: rect.minX + l, y: rect.maxY))
        p.move(to: CGPoint(x: rect.maxX - l, y: rect.maxY)); p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY)); p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - l))
        return p
    }
}

/// A plate with salmon, rice and broccoli (stand-in for the camera image).
private struct PlateIllustration: View {
    var body: some View {
        ZStack {
            Circle().fill(Color(hex: 0xE8E4DA))
            Circle().stroke(Color(hex: 0xF6F3EC), lineWidth: 14).padding(7)
            Capsule().fill(Color(hex: 0xE79A6B)).frame(width: 74, height: 50).offset(x: -24, y: -24)
            Capsule().fill(Color(hex: 0xF4F1E6)).frame(width: 70, height: 56).offset(x: 32, y: 17)
            Capsule().fill(Color(hex: 0x5E9E4A)).frame(width: 56, height: 44).offset(x: -15, y: 33)
        }
        .frame(width: 190, height: 190)
        .shadow(color: .black.opacity(0.45), radius: 20, x: 0, y: 20)
        .accessibilityHidden(true)
    }
}

/// A barcode with a moving scan line.
private struct BarcodeIllustration: View {
    private let widths: [CGFloat] = [4, 2, 6, 2, 3, 7, 2, 4, 2, 6, 3, 2, 5, 2, 4, 3, 6, 2]

    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            let phase = (sin(t * 2.2) + 1) / 2
            ZStack(alignment: .top) {
                RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color(hex: 0xF4F1E8))
                HStack(spacing: 3) {
                    ForEach(Array(widths.enumerated()), id: \.offset) { pair in
                        Rectangle().fill(Color(hex: 0x111111)).frame(width: pair.element, height: 84)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                Rectangle()
                    .fill(Palette.volt)
                    .frame(height: 2)
                    .shadow(color: Palette.volt, radius: 8)
                    .padding(.horizontal, 16)
                    .offset(y: 18 + 92 * phase)
            }
            .frame(width: 250, height: 130)
        }
        .accessibilityHidden(true)
    }
}
